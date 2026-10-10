"""Ticket board, DevRev-shaped. SQLite table `tickets` in DB_PATH is the local system of record (CF-xxxx ids).
With DEVREV_MODE=live and DEVREV_PAT set, real tickets are mirrored to DevRev in the background (create, severity, stage),
and stage changes made inside DevRev are pulled back by a small poller. Any DevRev failure leaves the local board working."""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from contracts.models import Cluster, Ticket, TicketStage

from . import live

log = logging.getLogger("civicflow.devrev")
ROOT = Path(__file__).resolve().parents[3]
SEVERITY = {"P1": "blocker", "P2": "high", "P3": "medium", "P4": "low"}
_lock = threading.Lock()
_rr: dict[str, int] = {}
_poller_started = False

DEFAULT_VENDORS = [
    {"name": "KC Road Crew Co.", "categories": ["pothole", "sidewalk_damage", "manhole_cover", "road_debris"], "phone": ""},
    {"name": "BrightLine Lighting", "categories": ["streetlight_out", "traffic_signal"], "phone": ""},
    {"name": "GreenLeaf Urban Services", "categories": ["downed_tree", "illegal_dumping", "graffiti", "flooding"], "phone": ""},
]


def _db_path() -> str:
    p = os.getenv("DB_PATH") or str(ROOT / "data" / "civicflow.db")
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    return p


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), timeout=10)
    c.row_factory = sqlite3.Row
    try:
        c.execute("PRAGMA journal_mode=WAL")
    except sqlite3.DatabaseError:
        pass
    c.execute("""CREATE TABLE IF NOT EXISTS tickets (
        num INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, cluster_id TEXT, title TEXT, body TEXT,
        severity TEXT, stage TEXT, vendor TEXT, tags TEXT, created_at TEXT, updated_at TEXT)""")
    have = {r[1] for r in c.execute("PRAGMA table_info(tickets)").fetchall()}
    for col in ("devrev_id", "devrev_display", "devrev_stage"):
        if col not in have:
            try:
                c.execute(f"ALTER TABLE tickets ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass
    return c


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row(r) -> Ticket | None:
    if r is None:
        return None
    tags = json.loads(r["tags"] or "[]")
    if r["devrev_display"]:
        tags = tags + [f"devrev:{r['devrev_display']}"]
    return Ticket(id=r["id"], cluster_id=r["cluster_id"], title=r["title"], body=r["body"],
                  severity=r["severity"], stage=r["stage"], vendor=r["vendor"],
                  tags=tags, created_at=r["created_at"], updated_at=r["updated_at"])


# ---------------------------------------------------------------- DevRev mirroring (live mode only)

def _should_sync(cluster: Cluster) -> bool:
    """Mirror real reports (and the demo hotspot) to DevRev. Simulated clusters stay local so we never flood the org."""
    if not live.configured():
        return False
    if os.getenv("DEVREV_SYNC_ALL") == "1":
        return True
    return (not cluster.simulated) or cluster.id == "c_hotspot"


def _bg(fn, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


def _devrev_body(cluster: Cluster, title: str, body: str, vendor: str | None) -> str:
    link = f"https://www.openstreetmap.org/?mlat={cluster.lat}&mlon={cluster.lng}"
    footer = (f"Civic Flow cluster {cluster.id} | {cluster.reporter_count} unique reporters | "
              f"priority {cluster.bucket} ({cluster.priority:.0f}/100)"
              + (f" | vendor: {vendor}" if vendor else ""))
    geo = [f"Neighborhood: {cluster.neighborhood}"] if cluster.neighborhood else []
    if getattr(cluster, "district", None):
        geo.append(f"District: {cluster.district}")
    zs = getattr(cluster, "zones", None) or []
    geo.append("Zones: " + ("; ".join(zs) if zs else "none"))
    if geo:
        footer += "\n" + " | ".join(geo)
    return "\n".join([body, "", "---", footer, f"Map: {link}"])


def _sync_create(tid: str, cluster: Cluster, title: str, body: str, vendor: str | None) -> None:
    dr = live.create_work(cluster.id, title, _devrev_body(cluster, title, body, vendor), SEVERITY[cluster.bucket])
    if not dr or not dr.get("id"):
        return
    with _lock:
        c = _conn()
        try:
            c.execute("UPDATE tickets SET devrev_id=?, devrev_display=?, devrev_stage=? WHERE id=?",
                      (dr["id"], dr.get("display_id"), dr.get("stage"), tid))
            c.commit()
        finally:
            c.close()
    log.info("Civic Flow %s mirrored to DevRev %s", tid, dr.get("display_id"))
    try:
        from . import events
        events.record("created", tid, dr.get("display_id"), f"{dr.get('display_id')} created in DevRev: {title}"[:200], "DevRev")
    except Exception:
        pass


def _sync_update(devrev_id: str, **fields) -> None:
    live.update_work(devrev_id, **fields)


def _ensure_poller() -> None:
    """Pull stage changes made inside DevRev back into the app (through the app's own advance endpoint)."""
    global _poller_started
    if _poller_started or not live.configured():
        return
    _poller_started = True
    threading.Thread(target=_poll_loop, daemon=True).start()


def _poll_loop() -> None:
    import time

    import httpx

    base = os.getenv("API_INTERNAL_URL", "http://127.0.0.1:8000")
    while True:
        time.sleep(int(os.getenv("DEVREV_POLL_S", "5")))
        try:
            c = _conn()
            try:
                rows = c.execute("SELECT * FROM tickets WHERE devrev_id IS NOT NULL").fetchall()
            finally:
                c.close()
            stages = live.stages_by_ref([r["cluster_id"] for r in rows])
            for r in rows:
                new = stages.get(r["cluster_id"])
                if new in live.KNOWN_STAGES and new != r["devrev_stage"]:
                    r = raw_row(r["id"]) or r  # re-read: an app action may have just written this stage itself
                    if new == r["devrev_stage"]:
                        continue
                    _record_external_change(r, new)
                    with _lock:
                        cc = _conn()
                        try:
                            cc.execute("UPDATE tickets SET devrev_stage=? WHERE id=?", (new, r["id"]))
                            cc.commit()
                        finally:
                            cc.close()
                    if new != r["stage"]:
                        httpx.post(f"{base}/api/tickets/{r['id']}/advance", json={"stage": new}, timeout=10)
                        log.info("DevRev moved %s to %s; applied locally", r["id"], new)
        except Exception as e:  # never let the poller die
            log.warning("DevRev poll error: %s", type(e).__name__)


def _record_external_change(r, new: str) -> None:
    """The poller saw a DevRev stage change that did not come from our own actions: log it as a DevRev event."""
    try:
        from . import events
        events.record_external_stage(r["id"], r["devrev_display"], r["devrev_stage"], new)
    except Exception as e:
        log.warning("event record failed: %s", type(e).__name__)


def set_devrev_stage_seen(ticket_id: str, stage: str) -> None:
    """Remember the DevRev stage we just wrote ourselves, so the poller does not treat it as an outside change."""
    with _lock:
        c = _conn()
        try:
            c.execute("UPDATE tickets SET devrev_stage=? WHERE id=?", (stage, ticket_id))
            c.commit()
        finally:
            c.close()


def raw_row(ticket_id: str):
    c = _conn()
    try:
        return c.execute("SELECT * FROM tickets WHERE id=?", (ticket_id,)).fetchone()
    finally:
        c.close()


def raw_rows() -> list:
    c = _conn()
    try:
        return c.execute("SELECT * FROM tickets ORDER BY num DESC").fetchall()
    finally:
        c.close()


def set_severity(ticket_id: str, severity: str) -> None:
    with _lock:
        c = _conn()
        try:
            c.execute("UPDATE tickets SET severity=?, updated_at=? WHERE id=?", (severity, _now(), ticket_id))
            c.commit()
        finally:
            c.close()


def add_comment(devrev_id: str, text: str) -> bool:
    return live.comment(devrev_id, text)


# ---------------------------------------------------------------- board API

def create_ticket(cluster: Cluster, title: str, body: str, vendor: str | None) -> Ticket:
    now = _now()
    tags = [cluster.category, cluster.bucket] + (["hazard"] if cluster.is_hazard else []) + (["simulated"] if cluster.simulated else [])
    with _lock:
        c = _conn()
        try:
            cur = c.execute(
                "INSERT INTO tickets (cluster_id,title,body,severity,stage,vendor,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (cluster.id, title, body, SEVERITY[cluster.bucket], "queued", vendor, json.dumps(tags), now, now))
            tid = f"CF-{1000 + cur.lastrowid}"
            c.execute("UPDATE tickets SET id=? WHERE num=?", (tid, cur.lastrowid))
            c.commit()
            ticket = _row(c.execute("SELECT * FROM tickets WHERE id=?", (tid,)).fetchone())
        finally:
            c.close()
    if _should_sync(cluster):
        _ensure_poller()
        _bg(_sync_create, tid, cluster, title, body, vendor)
    return ticket


def update_ticket(cluster: Cluster, title: str | None = None, body: str | None = None) -> Ticket | None:
    with _lock:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM tickets WHERE cluster_id=? ORDER BY num DESC LIMIT 1", (cluster.id,)).fetchone()
            if r is None:
                return None
            c.execute("UPDATE tickets SET title=?, body=?, severity=?, updated_at=? WHERE id=?",
                      (title or r["title"], body or r["body"], SEVERITY[cluster.bucket], _now(), r["id"]))
            c.commit()
            row = c.execute("SELECT * FROM tickets WHERE id=?", (r["id"],)).fetchone()
            ticket = _row(row)
        finally:
            c.close()
    if row["devrev_id"] and live.configured():
        _bg(lambda: _sync_update(row["devrev_id"], severity=SEVERITY[cluster.bucket], title=title,
                                 body=_devrev_body(cluster, row["title"], row["body"], row["vendor"])))
    return ticket


def set_stage(ticket_id: str, stage: TicketStage) -> Ticket | None:
    push = None
    with _lock:
        c = _conn()
        try:
            c.execute("UPDATE tickets SET stage=?, updated_at=? WHERE id=?", (stage, _now(), ticket_id))
            r = c.execute("SELECT * FROM tickets WHERE id=?", (ticket_id,)).fetchone()
            if r is not None and r["devrev_id"] and r["devrev_stage"] != stage and live.configured():
                c.execute("UPDATE tickets SET devrev_stage=? WHERE id=?", (stage, ticket_id))
                push = r["devrev_id"]
            c.commit()
            ticket = _row(c.execute("SELECT * FROM tickets WHERE id=?", (ticket_id,)).fetchone())
        finally:
            c.close()
    if push:
        _bg(lambda: _sync_update(push, stage=stage))
    return ticket


def get_ticket(ticket_id: str) -> Ticket | None:
    c = _conn()
    try:
        return _row(c.execute("SELECT * FROM tickets WHERE id=?", (ticket_id,)).fetchone())
    finally:
        c.close()


def list_tickets(limit: int = 100) -> list[Ticket]:
    c = _conn()
    try:
        return [_row(r) for r in c.execute("SELECT * FROM tickets ORDER BY num DESC LIMIT ?", (limit,)).fetchall()]
    finally:
        c.close()


def clear_tickets() -> None:
    with _lock:
        c = _conn()
        try:
            c.execute("DELETE FROM tickets")
            c.execute("DELETE FROM sqlite_sequence WHERE name='tickets'")
            c.commit()
        finally:
            c.close()
    _rr.clear()


def _vendors() -> list[dict]:
    try:
        return json.loads((ROOT / "data" / "seed" / "vendors.json").read_text(encoding="utf-8"))
    except Exception:
        return DEFAULT_VENDORS


def pick_vendor(category: str, district: str | None = None) -> str:
    """The crew for a category. Prefers a crew that serves the district; round-robin among the candidates."""
    vs = _vendors()
    matches = [v for v in vs if category in v.get("categories", [])] or vs[:1]
    if district:
        local = [v for v in matches if district in (v.get("districts") or v.get("areas") or [])]
        if local:
            matches = local
    key = f"{category}|{district or ''}"
    i = _rr.get(key, 0)
    _rr[key] = i + 1
    return matches[i % len(matches)]["name"]
