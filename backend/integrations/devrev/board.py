"""Live case-flow board: DevRev tickets joined with our clusters. Falls back to the local tickets table."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone

from . import events, live, raw_row, raw_rows
from .analytics import _pct, _ts, human

log = logging.getLogger("civicflow.devrev.board")
STAGE_KEYS = ("queued", "assigned", "in_progress", "awaiting_verification", "resolved")
LABELS = {"queued": "Queued", "assigned": "Assigned", "in_progress": "In progress",
          "awaiting_verification": "Awaiting verification", "resolved": "Resolved"}
SEV_RANK = {"blocker": 0, "high": 1, "medium": 2, "low": 3}
DUE_DAYS = {"P1": 2, "P2": 5, "P3": 10, "P4": 14}
PER_STAGE = 25
TTL_S = 4.0
_cache: dict = {"at": 0.0, "data": None}
_lock = threading.Lock()


# ---------------------------------------------------------------- pure helpers
def stage_key(devrev_stage: str | None, has_vendor_assigned: bool = False, awaiting: bool = False) -> str | None:
    """DevRev stage name -> UI stage key. None for canceled / unknown stages (not shown on the board)."""
    if devrev_stage == "resolved":
        return "resolved"
    if devrev_stage == "work_in_progress":
        return "awaiting_verification" if awaiting else "in_progress"
    if devrev_stage == "queued":
        return "assigned" if has_vendor_assigned else "queued"
    return None


def web_url(display_id: str | None) -> str | None:
    base = os.getenv("DEVREV_WEB_BASE", "").strip().rstrip("/")
    return f"{base}/{display_id}" if base and display_id else None


def due_of(first_reported_at: str | None, bucket: str) -> datetime | None:
    t = _ts(first_reported_at)
    return t + timedelta(days=DUE_DAYS.get(bucket, 14)) if t else None


def _iso(d: datetime | None) -> str | None:
    return d.isoformat().replace("+00:00", "Z") if d else None


def _clusters() -> dict:
    from backend.api import store
    return store.clusters


# ---------------------------------------------------------------- fetch
def _work(w: dict, ref: str) -> dict:
    owners = w.get("owned_by") or []
    return {
        "devrev_id": w.get("id"), "display": w.get("display_id"), "ref": ref,
        "stage": (w.get("stage") or {}).get("name"), "severity": w.get("severity") or "medium",
        "created": _ts(w.get("created_date")), "closed": _ts(w.get("actual_close_date")),
        "owner": (owners[0].get("display_name") or owners[0].get("full_name")) if owners else None,
    }


def fetch_works() -> list[dict] | None:
    out: list[dict] = []
    cursor = None
    ids = set(_clusters().keys())
    for _ in range(20):
        body: dict = {"type": ["ticket"], "limit": 100}
        if cursor:
            body["cursor"] = cursor
        s, j = live._post("works.list", body, timeout=12.0)
        if s != 200:
            return None
        for w in j.get("works", []):
            ref = w.get("external_ref") or ""
            if ref in ids:
                out.append(_work(w, ref))
        cursor = j.get("next_cursor")
        if not cursor:
            break
    return out


def fetch_one(ref: str) -> dict | None:
    s, j = live._post("works.list", {"external_ref": [ref], "type": ["ticket"]})
    ws = j.get("works") or []
    if s != 200 or not ws:
        return None
    return _work(ws[0], ref)


def _local_works() -> list[dict]:
    out = []
    for r in raw_rows():
        out.append({"devrev_id": r["devrev_id"], "display": r["devrev_display"], "ref": r["cluster_id"],
                    "stage": r["stage"], "severity": r["severity"] or "medium", "created": _ts(r["created_at"]),
                    "closed": _ts(r["updated_at"]) if r["stage"] == "resolved" else None, "owner": None,
                    "cf_id": r["id"]})
    return out


# ---------------------------------------------------------------- build
def _title(c) -> str:
    from backend.api import adapters
    return adapters.ticket_title(c)


def fix_photo_exists(cluster_id: str) -> bool:
    try:
        from backend.api import config
        return (config.PHOTO_DIR / f"fix_{cluster_id}.jpg").exists()
    except Exception:
        return False


def make_ticket(w: dict, cf_id: str, meta: dict, cluster, now: datetime) -> dict | None:
    awaiting = meta.get("awaiting", False)
    key = stage_key(w["stage"], bool(cluster.vendor) and cluster.status == "assigned", awaiting)
    if key is None:
        return None
    created = w["created"] or _ts(cluster.first_reported_at) or now
    end = w["closed"] if key == "resolved" and w["closed"] else now
    due = due_of(cluster.first_reported_at, cluster.bucket)
    return {
        "id": cf_id, "devrev_id": w["display"], "title": _title(cluster), "cluster_id": cluster.id, "stage_key": key,
        "severity": w["severity"] if w["severity"] in SEV_RANK else "medium", "priority_bucket": cluster.bucket,
        "vendor": cluster.vendor, "owner": w.get("owner"), "neighborhood": cluster.neighborhood,
        "district": cluster.district, "zones": list(cluster.zones or []), "reporters": cluster.reporter_count,
        "age_s": max(0.0, (end - created).total_seconds()), "due": _iso(due),
        "overdue": bool(due and key != "resolved" and due < now), "escalated": meta.get("escalated", False),
        "evidence_count": meta.get("evidence", 0) + (1 if fix_photo_exists(cluster.id) else 0),
        "web_url": web_url(w["display"]),
    }


def _cf_by_cluster() -> dict[str, str]:
    m: dict[str, str] = {}
    for r in raw_rows():  # newest first; keep the newest ticket per cluster
        m.setdefault(r["cluster_id"], r["id"])
    return m


def assemble(tickets: list[dict], source: str, now: datetime) -> dict:
    stages = []
    for k in STAGE_KEYS:
        ts = [t for t in tickets if t["stage_key"] == k]
        if k != "resolved":
            ts.sort(key=lambda t: (SEV_RANK.get(t["severity"], 2), t["age_s"]))
        avg = sum(t["age_s"] for t in ts) / len(ts) if ts else None
        stages.append({"key": k, "label": LABELS[k], "count": len(ts), "avg_age_s": avg, "tickets": ts[:PER_STAGE]})
    opened = [t for t in tickets if t["stage_key"] != "resolved"]
    ttr = [t["age_s"] for t in tickets if t["stage_key"] == "resolved"]
    return {"source": source, "as_of": _iso(now), "stages": stages,
            "totals": {"open": len(opened), "overdue": sum(1 for t in opened if t["overdue"]),
                       "escalated": sum(1 for t in opened if t["escalated"]), "resolved": len(ttr),
                       "median_ttr": human(_pct(ttr, 0.5))}}


def build(force: bool = False) -> dict:
    from . import _ensure_poller
    _ensure_poller()  # pull in DevRev-side changes once the board is in use
    with _lock:
        if not force and _cache["data"] and time.monotonic() - _cache["at"] < TTL_S:
            return _cache["data"]
        works = fetch_works() if live.configured() else None
        source = "devrev"
        if works is None:
            works, source = _local_works(), "local board"
        cl = _clusters()
        cfmap = _cf_by_cluster()
        metas = events.all_meta()
        now = datetime.now(timezone.utc)
        tickets = []
        for w in works:
            c = cl.get(w["ref"])
            cf = w.get("cf_id") or cfmap.get(w["ref"]) or (c.ticket_id if c else None)
            if c is None or not cf:
                continue
            t = make_ticket(w, cf, metas.get(cf, {}), c, now)
            if t:
                tickets.append(t)
        data = assemble(tickets, source, now)
        mirrored = {w["ref"] for w in works} if source == "devrev" else set(cl)
        data["totals"]["unsynced"] = len(set(cl) - mirrored)
        _cache.update(at=time.monotonic(), data=data)
        return data


def invalidate() -> None:
    _cache["at"] = 0.0


def current_work(cf_id: str):
    """(row, cluster, work) with a fresh DevRev read in live mode. None when the ticket is unknown."""
    r = raw_row(cf_id)
    if r is None:
        return None
    c = _clusters().get(r["cluster_id"])
    if c is None:
        return None
    w = fetch_one(c.id) if live.configured() else None
    if w is None:
        w = {"devrev_id": r["devrev_id"], "display": r["devrev_display"], "ref": c.id, "stage": r["stage"],
             "severity": r["severity"] or "medium", "created": _ts(r["created_at"]),
             "closed": _ts(r["updated_at"]) if r["stage"] == "resolved" else None, "owner": None}
    return r, c, w


def find_ticket(cf_id: str) -> dict | None:
    cw = current_work(cf_id)
    if cw is None:
        return None
    _, c, w = cw
    now = datetime.now(timezone.utc)
    return make_ticket(w, cf_id, events.get_meta(cf_id), c, now) or make_ticket({**w, "stage": "queued"}, cf_id, events.get_meta(cf_id), c, now)


# ---------------------------------------------------------------- journey
def _val(v) -> str | None:
    """Readable value of a DevRev field delta ({type, value} or a composite with a name field)."""
    if not isinstance(v, dict):
        return None
    if "value" in v:
        return str(v["value"])
    n = (v.get("fields") or {}).get("name")
    return str(n.get("value")) if isinstance(n, dict) else None


def _devrev_steps(devrev_id: str) -> list[dict]:
    s, j = live._post("timeline-entries.list", {"object": devrev_id}, timeout=10.0)
    if s != 200:
        return []
    out = []
    for e in j.get("timeline_entries", []):
        ts = e.get("created_date")
        who = (e.get("created_by") or {}).get("display_name") or "someone"
        if e.get("type") == "timeline_comment":
            body = (e.get("body") or "").strip()
            if body.startswith("Civic Flow:"):
                continue  # our own comments are shown from our recorded actions
            out.append({"ts": ts, "source": "devrev", "kind": "comment", "title": f"Comment by {who}", "detail": body[:400]})
        elif e.get("type") == "timeline_change_event":
            ev = e.get("event") or {}
            et = ev.get("type")
            if et == "created":
                continue
            deltas = {d.get("name"): d for d in (ev.get("updated") or {}).get("field_deltas", [])}
            title = None
            if "stage" in deltas:
                title = f"Stage: {_val(deltas['stage'].get('old_value')) or '?'} to {_val(deltas['stage'].get('new_value')) or '?'}"
            elif "severity" in deltas:
                title = f"Severity: {_val(deltas['severity'].get('old_value')) or '?'} to {_val(deltas['severity'].get('new_value')) or '?'}"
            if title:  # title/body/bookkeeping-only edits are noise on the journey
                out.append({"ts": ts, "source": "devrev", "kind": "stage", "title": title, "detail": f"Changed by {who}"})
    return out


def journey(cf_id: str) -> dict | None:
    t = find_ticket(cf_id)
    if t is None:
        return None
    from backend.api import store
    c = _clusters()[t["cluster_id"]]
    steps: list[dict] = []
    base = _ts(c.first_reported_at) or datetime.now(timezone.utc)
    trace = {}
    try:
        for s in json.loads(store.meta_get(f"trace:{c.id}") or "[]"):
            trace.setdefault(s.get("node"), s)
    except Exception:
        pass
    for i, r in enumerate(reversed(store.reports_for(c.id, 20))):
        steps.append({"ts": r.created_at, "source": "civicflow", "kind": "report",
                      "title": "First report" if i == 0 else "Another resident confirmed",
                      "detail": (r.note or f"{r.category.replace('_', ' ')} reported")[:200]})

    def at(n: int) -> str:  # agent steps carry no timestamps: place them just after the first report, in order
        return _iso(base + timedelta(milliseconds=200 * n))

    steps.append({"ts": at(1), "source": "civicflow", "kind": "vision",
                  "title": "Photo read" if c.photo_url else "Report read",
                  "detail": (trace.get("intake") or {}).get("summary") or
                  (f"Category {c.category.replace('_', ' ')}, severity {c.severity}/5"
                   + (f"; hazard: {c.hazard_description}" if c.is_hazard else ""))})
    geo = [x for x in (c.neighborhood, c.district) if x]
    steps.append({"ts": at(2), "source": "civicflow", "kind": "geofence", "title": "Location checked",
                  "detail": (", ".join(geo) or "Kansas City") + ("; " + "; ".join(c.zones) if c.zones else "; no priority zone")})
    dd = trace.get("dedup") or trace.get("judge")
    steps.append({"ts": at(3), "source": "civicflow", "kind": "dedup",
                  "title": "Duplicate check" if c.reporter_count <= 1 else f"{c.reporter_count} reports merged into one ticket",
                  "detail": (dd or {}).get("summary") or ("No nearby match, new issue" if c.reporter_count <= 1
                                                          else f"{c.report_count} reports from {c.reporter_count} residents")})
    steps.append({"ts": at(4), "source": "civicflow", "kind": "priority", "title": f"Priority {c.bucket} ({c.priority:.0f}/100)",
                  "detail": (c.rationale or (trace.get("priority") or {}).get("summary") or "")[:300]})
    if c.vendor:
        steps.append({"ts": at(5), "source": "civicflow", "kind": "routing", "title": f"Routed to {c.vendor}",
                      "detail": (trace.get("dispatch") or {}).get("summary") or f"Crew for {c.category.replace('_', ' ')}"})
    r = raw_row(cf_id)
    if r is not None:
        mirrored = bool(r["devrev_display"])
        steps.append({"ts": r["created_at"], "source": "devrev" if mirrored else "civicflow", "kind": "created",
                      "title": f"Ticket {t['devrev_id'] or cf_id} created",
                      "detail": "One ticket for this issue" + (", mirrored to DevRev" if mirrored else "")})
        if r["devrev_id"] and live.configured():
            steps += _devrev_steps(r["devrev_id"])
    for e in events.for_ticket(cf_id):
        if e["kind"] == "created" or e["text"].endswith("in DevRev"):
            continue  # creation has its own step; outside DevRev changes already show from DevRev's own history
        steps.append({"ts": e["ts"], "source": "civicflow", "kind": e["kind"], "title": e["text"], "detail": ""})
    steps = [s for s in steps if s.get("ts")]
    steps.sort(key=lambda s: _ts(s["ts"]) or datetime.min.replace(tzinfo=timezone.utc))
    return {"ticket": t, "steps": steps}
