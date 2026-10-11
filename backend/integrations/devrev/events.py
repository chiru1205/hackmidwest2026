"""Ticket events (SQLite table ticket_events) and small per-ticket state (table ticket_meta).
Rows come from board actions and from the DevRev poller when it sees a stage change made outside the app."""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone

from contracts.models import AgentVerdict

from . import _conn, _db_path

_lock = threading.Lock()
_ready = False
_ready_path = ""


def _db():
    global _ready, _ready_path
    c = _conn()
    if not _ready or _ready_path != _db_path():
        c.execute("""CREATE TABLE IF NOT EXISTS ticket_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, ticket_id TEXT, devrev_id TEXT,
            text TEXT, source TEXT)""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_te_ticket ON ticket_events(ticket_id, ts)")
        c.execute("""CREATE TABLE IF NOT EXISTS ticket_meta (
            ticket_id TEXT PRIMARY KEY, escalated INTEGER DEFAULT 0, awaiting INTEGER DEFAULT 0, evidence INTEGER DEFAULT 0)""")
        have = {r[1] for r in c.execute("PRAGMA table_info(ticket_meta)").fetchall()}
        for col, ddl in (("reopened", "INTEGER DEFAULT 0"), ("verdict", "TEXT"), ("note", "TEXT")):
            if col not in have:
                try:
                    c.execute(f"ALTER TABLE ticket_meta ADD COLUMN {col} {ddl}")
                except sqlite3.OperationalError:
                    pass
        c.execute("CREATE TABLE IF NOT EXISTS agent_settings (k TEXT PRIMARY KEY, v TEXT)")  # survives Admin Reset
        c.commit()
        _ready, _ready_path = True, _db_path()
    return c


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def record(kind: str, ticket_id: str, devrev_id: str | None, text: str, source: str = "DevRev") -> None:
    with _lock:
        c = _db()
        try:
            c.execute("INSERT INTO ticket_events (ts,kind,ticket_id,devrev_id,text,source) VALUES (?,?,?,?,?,?)",
                      (_now(), kind, ticket_id, devrev_id, text, source))
            c.commit()
        finally:
            c.close()


def recent(limit: int = 30) -> list[dict]:
    c = _db()
    try:
        rows = c.execute("SELECT * FROM ticket_events ORDER BY id DESC LIMIT ?", (max(1, min(limit, 200)),)).fetchall()
    finally:
        c.close()
    return [{"ts": r["ts"], "kind": r["kind"], "ticket_id": r["ticket_id"], "devrev_id": r["devrev_id"],
             "text": r["text"], "source": r["source"]} for r in rows]


def for_ticket(ticket_id: str) -> list[dict]:
    c = _db()
    try:
        rows = c.execute("SELECT * FROM ticket_events WHERE ticket_id=? ORDER BY id", (ticket_id,)).fetchall()
    finally:
        c.close()
    return [dict(r) for r in rows]


def _meta_of(r) -> dict:
    return {"escalated": bool(r["escalated"]), "awaiting": bool(r["awaiting"]), "evidence": int(r["evidence"]),
            "reopened": int(r["reopened"] or 0), "note": r["note"]}


def get_meta(ticket_id: str) -> dict:
    c = _db()
    try:
        r = c.execute("SELECT * FROM ticket_meta WHERE ticket_id=?", (ticket_id,)).fetchone()
    finally:
        c.close()
    return _meta_of(r) if r else {"escalated": False, "awaiting": False, "evidence": 0, "reopened": 0, "note": None}


def all_meta() -> dict[str, dict]:
    c = _db()
    try:
        rows = c.execute("SELECT * FROM ticket_meta").fetchall()
    finally:
        c.close()
    return {r["ticket_id"]: _meta_of(r) for r in rows}


def set_meta(ticket_id: str, **kw) -> None:
    with _lock:
        c = _db()
        try:
            c.execute("INSERT OR IGNORE INTO ticket_meta (ticket_id) VALUES (?)", (ticket_id,))
            for k, v in kw.items():
                if k in ("escalated", "awaiting", "evidence", "reopened"):
                    c.execute(f"UPDATE ticket_meta SET {k}=? WHERE ticket_id=?", (int(v), ticket_id))
                elif k == "note":  # the crew's note for the current verification request
                    c.execute("UPDATE ticket_meta SET note=? WHERE ticket_id=?", (v, ticket_id))
            c.commit()
        finally:
            c.close()


# ---------------------------------------------------------------- agent: verdicts, counts, runtime mode
def get_verdict(ticket_id: str) -> AgentVerdict | None:
    c = _db()
    try:
        r = c.execute("SELECT verdict FROM ticket_meta WHERE ticket_id=?", (ticket_id,)).fetchone()
    finally:
        c.close()
    if not r or not r["verdict"]:
        return None
    try:
        return AgentVerdict.model_validate_json(r["verdict"])
    except Exception:
        return None


def set_verdict(ticket_id: str, verdict: AgentVerdict | None) -> None:
    with _lock:
        c = _db()
        try:
            c.execute("INSERT OR IGNORE INTO ticket_meta (ticket_id) VALUES (?)", (ticket_id,))
            c.execute("UPDATE ticket_meta SET verdict=? WHERE ticket_id=?",
                      (verdict.model_dump_json() if verdict else None, ticket_id))
            c.commit()
        finally:
            c.close()


def verdict_rows() -> list[tuple[str, bool, str | None]]:
    """(ticket id, awaiting, verdict state or None) for every ticket that has a flag row."""
    c = _db()
    try:
        rows = c.execute("SELECT ticket_id, awaiting, verdict FROM ticket_meta").fetchall()
    finally:
        c.close()
    out = []
    for r in rows:
        state = None
        if r["verdict"]:
            try:
                state = AgentVerdict.model_validate_json(r["verdict"]).state
            except Exception:
                state = None
        out.append((r["ticket_id"], bool(r["awaiting"]), state))
    return out


def agent_counts() -> dict:
    """closed_by_agent: cases the agent closed itself and that are still closed (the latest close-or-reopen event of the
    ticket is an Agent close); recommended: cases where it recommended approval (event log)."""
    c = _db()
    try:
        closed = c.execute(
            "SELECT COUNT(*) FROM ticket_events e WHERE e.source='Agent' AND e.kind='resolved' AND e.id = "
            "(SELECT MAX(id) FROM ticket_events WHERE ticket_id=e.ticket_id AND kind IN ('resolved','reopened'))").fetchone()[0]
        rec = c.execute("SELECT COUNT(DISTINCT ticket_id) FROM ticket_events WHERE source='Agent' AND kind='comment' "
                        "AND text LIKE '%recommends approval%'").fetchone()[0]
    finally:
        c.close()
    return {"closed_by_agent": int(closed), "recommended": int(rec)}


def get_setting(key: str) -> str | None:
    c = _db()
    try:
        r = c.execute("SELECT v FROM agent_settings WHERE k=?", (key,)).fetchone()
    finally:
        c.close()
    return r["v"] if r else None


def set_setting(key: str, value: str) -> None:
    with _lock:
        c = _db()
        try:
            c.execute("INSERT INTO agent_settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (key, value))
            c.commit()
        finally:
            c.close()


def external_kind(old: str | None, new: str) -> str:
    if new == "resolved":
        return "resolved"
    if old == "resolved":
        return "reopened"
    return "stage"


def record_external_stage(ticket_id: str, display: str | None, old: str | None, new: str) -> None:
    """Called by the poller for a DevRev stage change that did not come from our own action."""
    if new != "work_in_progress":
        set_meta(ticket_id, awaiting=False)
    if external_kind(old, new) == "reopened":  # same bookkeeping as our own reopen: it counts, and the fix cycle starts over
        set_meta(ticket_id, awaiting=False, evidence=0, reopened=get_meta(ticket_id)["reopened"] + 1)
        set_verdict(ticket_id, None)
        try:
            from . import board, raw_row
            r = raw_row(ticket_id)
            if r is not None:
                board.clear_after_photos(r["cluster_id"])
        except Exception:
            pass
    label = display or ticket_id
    record(external_kind(old, new), ticket_id, display,
           f"{label} moved from {old or 'unknown'} to {new} in DevRev", "DevRev")


def clear_all() -> None:
    """Admin Reset: drop every saved ticket event and per-ticket flag (awaiting / escalated / evidence)."""
    with _lock:
        c = _db()
        try:
            c.execute("DELETE FROM ticket_events")
            c.execute("DELETE FROM ticket_meta")
            c.commit()
        finally:
            c.close()
