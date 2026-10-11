"""Workflow page "case journey": the filtered case list (whole board, server-side) and one case's six-station detail."""
from __future__ import annotations

import json
import math
import os
import re

from contracts.models import CaseDetail, CaseList

from . import actions, board, case_search, events, raw_rows

GROUPS = ("needs", "approval", "overdue", "escalated", "no_crew", "all")
REASONS = ("approval", "overdue", "escalated", "no_crew")
NO_CREW_AFTER_S = 86400
BUCKET_RANK = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}
DEVREV_STAGE = {"queued": "queued", "assigned": "queued", "in_progress": "work_in_progress",
                "awaiting_verification": "work_in_progress", "resolved": "resolved"}
ZONE_RANK = ("School zone", "Hospital zone", "Arterial corridor")
DEVREV_LABEL = {"queued": "Queued", "work_in_progress": "In progress", "resolved": "Resolved"}


class NotFound(Exception):
    pass


# ---------------------------------------------------------------- list
def reasons_of(t: dict) -> list[str]:
    done = t["stage_key"] == "resolved"
    out = []
    if t["stage_key"] == "awaiting_verification":
        out.append("approval")
    if t["overdue"] and not done:
        out.append("overdue")
    if t["escalated"] and not done:
        out.append("escalated")
    if t["stage_key"] == "queued" and t["age_s"] > NO_CREW_AFTER_S:
        out.append("no_crew")
    return out


def _haystack(t: dict) -> str:
    return " ".join(str(t.get(k) or "") for k in ("title", "id", "devrev_id", "cluster_id", "vendor", "neighborhood", "district")).lower()


def _urgency(item: tuple[dict, list[str]]):
    t, rs = item
    if t["stage_key"] == "resolved":  # most recently closed first (age_s of a closed ticket is its time-to-fix)
        return (True, 0, 0, -board.closed_epoch(t["id"]), t["id"])
    return (False, BUCKET_RANK.get(t["priority_bucket"], 9), 0 if rs else 1, -t["age_s"], t["id"])


def _grouped(item: tuple[dict, list[str]]):
    """Needs-you order: rail group first (so each page holds whole groups in order), then urgency."""
    rs = item[1]
    return (min(REASONS.index(r) for r in rs) if rs else len(REASONS),) + _urgency(item)


def agent_closed() -> int:
    try:
        return events.agent_counts()["closed_by_agent"]
    except Exception:
        return 0


def _closest(needle: str, rows: list[tuple[dict, list[str]]], pick: list[tuple[dict, list[str]]]) -> list[tuple[dict, list[str]]]:
    """Semantic matches for the query among `pick` that the substring search misses, most similar first. [] when the
    query is too short or names a case id, the index is not ready, or embeddings are unavailable."""
    try:
        if not case_search.wants_semantic(needle, [t for t, _ in rows]):
            return []
        cl = board._clusters()
        urgent = sorted((x for x in rows if x[0]["stage_key"] != "resolved" and x[0]["cluster_id"] in cl), key=_urgency)
        open_rows = [(t, case_search.case_text(t, cl[t["cluster_id"]])) for t, _ in urgent[:case_search.CAP]]
        by_id = {t["id"]: x for x in pick for t in [x[0]] if needle not in _haystack(t)}
        hits = case_search.semantic_hits(needle, set(by_id), open_rows)
        return [by_id[cid] for cid, _ in hits]
    except Exception:
        return []


def list_cases(group: str = "needs", q: str = "", district: str = "", limit: int = 30, offset: int = 0) -> dict:
    tickets, source, as_of = board.all_tickets()
    rows = [(t, reasons_of(t)) for t in tickets]
    counts = {"open": 0, "approval": 0, "overdue": 0, "escalated": 0, "no_crew": 0, "needs_you": 0,
              "agent_closed": agent_closed()}
    for t, rs in rows:
        counts["open"] += t["stage_key"] != "resolved"
        counts["needs_you"] += bool(rs)
        for r in rs:
            counts[r] += 1

    if group == "all":
        pick = rows
    elif group in REASONS:
        pick = [x for x in rows if group in x[1]]
    else:
        pick = [x for x in rows if x[1]]
    needle = (q or "").strip().lower()
    dist = (district or "").strip().lower()
    if dist:
        pick = [x for x in pick if (x[0].get("district") or "").lower() == dist]
    near: list[tuple[dict, list[str]]] = []
    if needle:
        near = _closest(needle, rows, pick)
        pick = [x for x in pick if needle in _haystack(x[0])]
    pick.sort(key=_grouped if group == "needs" else _urgency)
    pick += near  # exact and substring matches first, then the semantic matches by similarity

    limit = max(1, min(int(limit), 100))
    offset = max(0, int(offset))
    items = [{**t, "reasons": rs} for t, rs in pick[offset:offset + limit]]
    return CaseList(source=source, as_of=as_of, total=len(pick), counts=counts, items=items, semantic=bool(near)).model_dump(mode="json")


# ---------------------------------------------------------------- detail
def _cf_id(ident: str) -> str:
    """CF- ids pass through; a TKT- id is looked up on the local ticket rows (newest first)."""
    ident = ident.strip()
    if ident.upper().startswith("TKT-"):
        for r in raw_rows():
            if (r["devrev_display"] or "").upper() == ident.upper():
                return r["id"]
        raise NotFound(ident)
    return ident


def _step_ts(steps: list[dict], *kinds: str, last: bool = False) -> str | None:
    hit = [s["ts"] for s in steps if s["kind"] in kinds]
    return (hit[-1] if last else hit[0]) if hit else None


_VERIFY_NOTE = re.compile(r"awaiting verification \((.*?)\)(?: \[DevRev comment not posted\])?$")


def crew_note(steps: list[dict], stage_key: str) -> str | None:
    """The note sent with the current 'request verification'. Only meaningful while the case awaits verification."""
    if stage_key != "awaiting_verification":
        return None
    for s in reversed(steps):
        if s["kind"] == "verification":
            m = _VERIFY_NOTE.search(s["title"])
            return m.group(1).strip() or None if m else None
    return None


def can_do(stage_key: str, severity: str = "medium") -> list[str]:
    """Actions the rules allow now. Evidence is assumed: a note sent with the action counts as evidence, and the page asks for it."""
    return [a for a in actions.ACTIONS if actions.check_transition(a, stage_key, severity, True) is None]


def _location(zones: list[str], crit: float = 0.0) -> str:
    kinds = [z.partition(": ")[0] for z in zones]
    for k in ZONE_RANK:
        if k in kinds:
            return k
    if kinds:
        return kinds[0]
    return "School or hospital zone" if crit >= 1.0 else "Arterial corridor" if crit >= 0.8 else "Standard"


def factors(c) -> list[dict]:
    return [
        {"label": "Severity", "value": f"{c.severity} of 5", "pct": c.severity * 20.0},
        {"label": "Neighbors reporting", "value": str(c.reporter_count),
         "pct": round(min(100.0, 100 * math.log10(1 + c.reporter_count) / math.log10(1 + 200)), 1)},
        {"label": "Safety hazard", "value": "Yes" if c.is_hazard else "No", "pct": 85.0 if c.is_hazard else 0.0},
        {"label": "Location", "value": _location(list(c.zones or []), c.location_crit), "pct": round(c.location_crit * 100, 1)},
    ]


def _neighbors(n: int) -> str:
    return f"{n} neighbors sent photos and notes" if n != 1 else "1 neighbor sent a photo and note"


def understood_chip(c) -> str:
    """Name only what the saved trace of the first report shows really ran: a photo read, hosted embeddings."""
    try:
        from backend.api import store
        trace = json.loads(store.meta_get(f"trace:{c.id}") or "[]")
    except Exception:
        trace = []
    intake = next((s for s in trace if s.get("node") == "intake"), {})
    vision = str(intake.get("summary") or "").startswith("vision:")
    akamai = "akamai" in str(intake.get("summary") or "").lower() or any(str(s.get("model") or "").startswith("akamai") for s in trace)
    return " + ".join(x for x, on in (("AI vision", vision), ("Akamai AI", akamai)) if on) or "Civic Flow"


def stations(t: dict, c, steps: list[dict], agent=None) -> list[dict]:
    from backend.api import adapters
    key = t["stage_key"]
    n = max(1, t["reporters"])
    synced = bool(t["devrev_id"])
    label = board.LABELS[key]  # local wording, used when the case is not mirrored to DevRev
    # how many stations are finished; the next one is "now" (none after resolved)
    done_upto = {"queued": 3, "assigned": 3, "in_progress": 3, "awaiting_verification": 4, "resolved": 6}[key]

    def state(i: int) -> str:
        return "done" if i < done_upto else "now" if i == done_upto else "todo"

    cat = adapters.LABELS.get(c.category, c.category.replace("_", " "))
    understood = f"{cat}, severity {c.severity} of 5" + (", safety hazard" if c.is_hazard else "") + ". " + (
        f"{c.report_count} reports merged into one ticket." if c.report_count > 1 else "No duplicates found.")
    crew_ts = _step_ts(steps, "stage", last=True) or _step_ts(steps, "routing")
    photo = board.fix_photo_exists(c.id)
    verify_detail = {"done": "Fix checked and approved",
                     "now": "Marked ready for your check" + (", with an after-photo" if photo else ""),
                     "todo": "The crew sends an after-photo for you to check"}[state(4)]
    by_agent = agent is not None and agent.state == "auto_approved" and key == "resolved"
    if by_agent:
        verify_detail = "The agent compared the before and after photos and closed the case"
    dr_label = DEVREV_LABEL[DEVREV_STAGE[key]]
    crew_detail = c.vendor or ("Waiting for a crew" if key in ("queued", "assigned") else "Crew not recorded")
    raw = [
        ("reported", "Reported", _neighbors(n), "Civic Flow", "civicflow",
         _step_ts(steps, "report")),
        ("understood", "Understood", understood, understood_chip(c), "civicflow", _step_ts(steps, "dedup", "vision")),
        ("ticket", "Ticket opened",
         f"{t['devrev_id'] or t['id']} opened with priority {t['priority_bucket']} ({c.priority:.0f}/100)",
         f"DevRev - {t['devrev_id']}" if synced else "Local ticket", "devrev" if synced else "civicflow",
         _step_ts(steps, "created")),
        ("crew", "Crew working", crew_detail, f"DevRev - {dr_label}" if synced else f"Local - {label}",
         "devrev" if synced else "civicflow", crew_ts),
        ("verify", "Verify", verify_detail, "Agent verified" if by_agent else "Civic Flow", "agent" if by_agent else "civicflow",
         _step_ts(steps, "resolved", last=True) if by_agent else _step_ts(steps, "verification", last=True)),
        ("told", "Citizens told", f"{n} neighbors get Fixed!" if n != 1 else "1 neighbor gets Fixed!",
         "DevRev - Resolved" if synced else "Local ticket",
         "devrev" if synced else "civicflow", _step_ts(steps, "resolved", last=True)),
    ]
    return [{"key": k, "title": ti, "detail": d, "state": state(i), "chip": ch, "chip_source": src,
             "ts": ts if state(i) != "todo" else None} for i, (k, ti, d, ch, src, ts) in enumerate(raw)]


def case_detail(ident: str) -> dict:
    """Raises NotFound for an unknown id. Reuses board.journey (the only call that can reach DevRev)."""
    cf = _cf_id(ident)
    j = board.journey(cf)
    if j is None:
        raise NotFound(ident)
    t, steps = j["ticket"], j["steps"]
    c = board._clusters()[t["cluster_id"]]
    synced = bool(t["devrev_id"])
    agent = events.get_verdict(cf)
    after = f"/photos/fix_{c.id}.jpg" if board.fix_photo_exists(c.id) else None
    record = {
        "display_id": t["devrev_id"], "stage": DEVREV_STAGE[t["stage_key"]] if synced else None,
        "severity": t["severity"] if synced else None,
        "part": os.getenv("DEVREV_PART", "PROD-1") if synced else None,
        "owner": (t["owner"] or os.getenv("DEVREV_OWNER_DEVU") or None) if synced else None,
        "external_ref": c.id if synced else None, "web_url": t["web_url"], "synced": synced,
    }
    return CaseDetail(
        ticket=t, category=c.category, address=c.address, before_photo_url=c.photo_url, after_photo_url=after,
        crew_note=crew_note(steps, t["stage_key"]), priority_score=c.priority, rationale=c.rationale, factors=factors(c),
        duplicates_avoided=max(0, c.reporter_count - 1), devrev=record, stations=stations(t, c, steps, agent),
        timeline=steps, can=can_do(t["stage_key"], t["severity"]), agent=agent).model_dump(mode="json")
