"""Ticket events (SQLite table ticket_events) and small per-ticket state (table ticket_meta).
Rows come from board actions and from the DevRev poller when it sees a stage change made outside the app."""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from . import _conn

_lock = threading.Lock()
_ready = False


def _db():
    global _ready
    c = _conn()
    if not _ready:
        c.execute("""CREATE TABLE IF NOT EXISTS ticket_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, ticket_id TEXT, devrev_id TEXT,
            text TEXT, source TEXT)""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_te_ticket ON ticket_events(ticket_id, ts)")
        c.execute("""CREATE TABLE IF NOT EXISTS ticket_meta (
            ticket_id TEXT PRIMARY KEY, escalated INTEGER DEFAULT 0, awaiting INTEGER DEFAULT 0, evidence INTEGER DEFAULT 0)""")
        c.commit()
        _ready = True
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


def get_meta(ticket_id: str) -> dict:
    c = _db()
    try:
        r = c.execute("SELECT * FROM ticket_meta WHERE ticket_id=?", (ticket_id,)).fetchone()
    finally:
        c.close()
    return {"escalated": bool(r["escalated"]), "awaiting": bool(r["awaiting"]), "evidence": int(r["evidence"])} if r \
        else {"escalated": False, "awaiting": False, "evidence": 0}


def all_meta() -> dict[str, dict]:
    c = _db()
    try:
        rows = c.execute("SELECT * FROM ticket_meta").fetchall()
    finally:
        c.close()
    return {r["ticket_id"]: {"escalated": bool(r["escalated"]), "awaiting": bool(r["awaiting"]),
                             "evidence": int(r["evidence"])} for r in rows}


def set_meta(ticket_id: str, **kw) -> None:
    with _lock:
        c = _db()
        try:
            c.execute("INSERT OR IGNORE INTO ticket_meta (ticket_id) VALUES (?)", (ticket_id,))
            for k, v in kw.items():
                if k in ("escalated", "awaiting", "evidence"):
                    c.execute(f"UPDATE ticket_meta SET {k}=? WHERE ticket_id=?", (int(v), ticket_id))
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
