"""Work-order analytics. Reads real tickets from DevRev (works.list) and keeps only Civic Flow ones.
Falls back to the local tickets table (source "local board") when DevRev is off or unreachable."""
from __future__ import annotations

import logging
import re
import threading
import time
from datetime import datetime, timezone

from . import _conn, live

log = logging.getLogger("civicflow.devrev.analytics")
TTL_S = 15.0
SEVERITIES = ("blocker", "high", "medium", "low")
STAGES = ("queued", "work_in_progress", "resolved")
_cache: dict = {"at": 0.0, "data": None}
_lock = threading.Lock()


def _ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def human(sec: float | None) -> str | None:
    if sec is None:
        return None
    sec = max(0, int(round(sec)))
    if sec < 60:
        return f"{sec}s"
    m = sec // 60
    if m < 60:
        return f"{m}m {sec % 60}s" if m < 10 else f"{m}m"
    h, m = divmod(m, 60)
    if h < 24:
        return f"{h}h {m}m"
    d, h = divmod(h, 24)
    return f"{d}d {h}h"


def _pct(vals: list[float], p: float) -> float | None:
    if not vals:
        return None
    v = sorted(vals)
    k = (len(v) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


_VENDOR = re.compile(r"\|\s*vendor:\s*([^|\n]+)")


def _vendor_of(body: str | None) -> str:
    m = _VENDOR.search(body or "")
    return m.group(1).strip() if m else "Unassigned"


def _cluster_ids() -> set[str]:
    try:
        from backend.api import store
        return set(store.clusters.keys())
    except Exception:
        return set()


def _fetch_devrev() -> list[dict] | None:
    ids = _cluster_ids()
    out: list[dict] = []
    cursor = None
    for _ in range(20):  # hard cap: 2000 tickets
        body: dict = {"type": ["ticket"], "limit": 100}
        if cursor:
            body["cursor"] = cursor
        s, j = live._post("works.list", body, timeout=12.0)
        if s != 200:
            return None
        for w in j.get("works", []):
            ref = w.get("external_ref") or ""
            if ref in ids or ref.startswith("c_"):
                out.append({
                    "stage": (w.get("stage") or {}).get("name") or "other",
                    "severity": w.get("severity") or "medium",
                    "created": _ts(w.get("created_date")),
                    "closed": _ts(w.get("actual_close_date")),
                    "vendor": _vendor_of(w.get("body")),
                })
        cursor = j.get("next_cursor")
        if not cursor:
            return out
    return out


def _fetch_local() -> list[dict]:
    c = _conn()
    try:
        rows = c.execute("SELECT * FROM tickets").fetchall()
    finally:
        c.close()
    out = []
    for r in rows:
        stage = r["stage"]
        out.append({"stage": stage, "severity": r["severity"] or "medium", "created": _ts(r["created_at"]),
                    "closed": _ts(r["updated_at"]) if stage == "resolved" else None,
                    "vendor": r["vendor"] or "Unassigned"})
    return out


def _compute(tickets: list[dict], source: str) -> dict:
    now = datetime.now(timezone.utc)
    by_stage = {k: 0 for k in STAGES}
    by_stage["other"] = 0
    backlog = {k: 0 for k in SEVERITIES}
    vendors: dict[str, dict] = {}
    ttr: list[float] = []
    oldest: float | None = None
    last_hour = 0
    for t in tickets:
        st = t["stage"]
        by_stage[st if st in STAGES else "other"] += 1
        v = vendors.setdefault(t["vendor"], {"vendor": t["vendor"], "total": 0, "open": 0, "resolved": 0})
        v["total"] += 1
        created = t["created"]
        if created and (now - created).total_seconds() <= 3600:
            last_hour += 1
        if st == "resolved":
            v["resolved"] += 1
            if created and t["closed"] and t["closed"] >= created:
                ttr.append((t["closed"] - created).total_seconds())
        elif st != "canceled":
            v["open"] += 1
            backlog[t["severity"] if t["severity"] in backlog else "medium"] += 1
            if created:
                age = (now - created).total_seconds()
                oldest = age if oldest is None else max(oldest, age)
    med, p90 = _pct(ttr, 0.5), _pct(ttr, 0.9)
    return {
        "source": source, "as_of": now.isoformat().replace("+00:00", "Z"),
        "total": len(tickets), "by_stage": by_stage, "open_backlog": backlog,
        "open_total": sum(backlog.values()), "resolved": by_stage["resolved"], "resolved_timed": len(ttr),
        "median_ttr_s": med, "median_ttr": human(med), "p90_ttr_s": p90, "p90_ttr": human(p90),
        "oldest_open_s": oldest, "oldest_open": human(oldest), "created_last_hour": last_hour,
        "vendors": sorted(vendors.values(), key=lambda v: -v["total"]),
    }


FALLBACK_TTL_S = 3.0  # a local-board fallback is retried against DevRev quickly instead of sticking for TTL_S


def snapshot(force: bool = False) -> dict:
    with _lock:
        ttl = TTL_S if (_cache["data"] or {}).get("source") == "devrev" else FALLBACK_TTL_S
        if not force and _cache["data"] and time.monotonic() - _cache["at"] < ttl:
            return _cache["data"]
        tickets = None
        if live.configured():
            for attempt in (1, 2):  # one retry: the first call after a restart can time out
                try:
                    tickets = _fetch_devrev()
                    break
                except Exception as e:
                    log.warning("DevRev analytics attempt %d failed: %s", attempt, type(e).__name__)
        data = _compute(tickets, "devrev") if tickets is not None else _compute(_fetch_local(), "local board")
        _cache.update(at=time.monotonic(), data=data)
        return data
