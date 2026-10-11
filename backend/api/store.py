"""SQLite persistence + in-memory working set (clusters, geo cells, counters)."""
from __future__ import annotations

import asyncio
import json
import sqlite3
import uuid
from datetime import datetime, timezone

from contracts.models import Cluster, Report, Stats
from backend.engine import geo

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT, neighborhood TEXT, xp INTEGER DEFAULT 0,
  reports INTEGER DEFAULT 0, confirmations INTEGER DEFAULT 0, fixed INTEGER DEFAULT 0,
  streak_weeks INTEGER DEFAULT 0, photos INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS clusters(id TEXT PRIMARY KEY, data TEXT, status TEXT, priority REAL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, cluster_id TEXT, user_id TEXT, data TEXT, phash TEXT,
  simulated INTEGER DEFAULT 0, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_rep_cu ON reports(cluster_id, user_id);
CREATE INDEX IF NOT EXISTS ix_rep_u ON reports(user_id, created_at);
CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, points INTEGER,
  reason TEXT, cluster_id TEXT, ts TEXT);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, type TEXT, ts TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS kv_meta(k TEXT PRIMARY KEY, v TEXT);
"""

_conn: sqlite3.Connection | None = None
alock = asyncio.Lock()          # serialises dedup decisions + mutations
clusters: dict[str, Cluster] = {}
cells: dict[str, set[str]] = {}
_cell_of: dict[str, str] = {}
counters: dict = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=OFF")
        _conn.executescript(SCHEMA)
    return _conn


def q(sql: str, params=()) -> list[sqlite3.Row]:
    return conn().execute(sql, params).fetchall()


def x(sql: str, params=()) -> None:
    conn().execute(sql, params)


def default_counters() -> dict:
    return {"total_reports": 0, "duplicates_absorbed": 0, "llm_calls_avoided": 0,
            "edge_hits": 0, "edge_misses": 0, "edge_ms_sum": 0.0, "edge_n": 0, "semantic_merges": 0}


def init() -> None:
    conn()
    load_all()


def load_all() -> None:
    clusters.clear(); cells.clear(); _cell_of.clear()
    for r in q("SELECT data FROM clusters"):
        _index(Cluster(**json.loads(r["data"])))
    raw = meta_get("counters")
    counters.clear()
    counters.update(default_counters())
    if raw:
        counters.update(json.loads(raw))


def _index(c: Cluster) -> None:
    clusters[c.id] = c
    cell = geo.geohash(c.lat, c.lng, 7)
    old = _cell_of.get(c.id)
    if old and old != cell:
        cells.get(old, set()).discard(c.id)
    _cell_of[c.id] = cell
    cells.setdefault(cell, set()).add(c.id)


def cell_of(c: Cluster) -> str:
    return _cell_of.get(c.id) or geo.geohash(c.lat, c.lng, 7)


def save_cluster(c: Cluster) -> None:
    _index(c)
    x("INSERT OR REPLACE INTO clusters(id,data,status,priority,updated_at) VALUES(?,?,?,?,?)",
      (c.id, c.model_dump_json(), c.status, c.priority, now_iso()))


# ---- meta / counters
def meta_get(k: str):
    r = q("SELECT v FROM kv_meta WHERE k=?", (k,))
    return r[0]["v"] if r else None


def meta_set(k: str, v: str) -> None:
    x("INSERT OR REPLACE INTO kv_meta(k,v) VALUES(?,?)", (k, v))


def persist_counters() -> None:
    meta_set("counters", json.dumps(counters))


LATENCY_KEY, LATENCY_KEEP = "report_to_ticket_s", 200


def record_latency(seconds: float) -> None:
    """Rolling list of how long the pipeline took from receiving a report to returning the new ticket."""
    try:
        items = json.loads(meta_get(LATENCY_KEY) or "[]")
        items.append(round(float(seconds), 3))
        meta_set(LATENCY_KEY, json.dumps(items[-LATENCY_KEEP:]))
    except Exception:
        pass


def latencies() -> list[float]:
    try:
        return [float(v) for v in json.loads(meta_get(LATENCY_KEY) or "[]")]
    except Exception:
        return []


def timeline_add(cluster_id: str, label: str, detail: str = "") -> None:
    key = f"tl:{cluster_id}"
    items = json.loads(meta_get(key) or "[]")
    items.append({"ts": now_iso(), "label": label, "detail": detail})
    meta_set(key, json.dumps(items[-60:]))


def stats() -> Stats:
    cs = clusters.values()
    n = counters["edge_n"]
    return Stats(
        total_reports=counters["total_reports"], unique_clusters=len(clusters),
        duplicates_absorbed=counters["duplicates_absorbed"], llm_calls_avoided=counters["llm_calls_avoided"],
        open_clusters=sum(1 for c in cs if c.status != "fixed"),
        fixed_clusters=sum(1 for c in cs if c.status == "fixed"),
        tickets=sum(1 for c in cs if c.ticket_id),
        edge_hits=counters["edge_hits"], edge_misses=counters["edge_misses"],
        avg_edge_ms=round(counters["edge_ms_sum"] / n, 3) if n else 0.0)


# ---- users
def ensure_user(uid: str, name: str | None = None, neighborhood: str = "Downtown") -> sqlite3.Row:
    r = q("SELECT * FROM users WHERE id=?", (uid,))
    if not r:
        nm = name or ("You" if uid == "u_you" else uid)
        x("INSERT INTO users(id,name,neighborhood,created_at) VALUES(?,?,?,?)", (uid, nm, neighborhood, now_iso()))
        r = q("SELECT * FROM users WHERE id=?", (uid,))
    return r[0]


def award(uid: str, points: int, reason: str, cluster_id: str | None) -> None:
    ensure_user(uid)
    x("UPDATE users SET xp=xp+? WHERE id=?", (points, uid))
    x("INSERT INTO ledger(user_id,points,reason,cluster_id,ts) VALUES(?,?,?,?,?)",
      (uid, points, reason, cluster_id, now_iso()))


def user_xp(uid: str) -> int:
    r = q("SELECT xp FROM users WHERE id=?", (uid,))
    return int(r[0]["xp"]) if r else 0


# ---- reports
def insert_report(r: Report) -> None:
    x("INSERT OR REPLACE INTO reports(id,cluster_id,user_id,data,phash,simulated,created_at) VALUES(?,?,?,?,?,?,?)",
      (r.id, r.cluster_id, r.user_id, r.model_dump_json(), r.phash, int(r.simulated), r.created_at))


def user_in_cluster(cluster_id: str, uid: str) -> bool:
    return bool(q("SELECT 1 FROM reports WHERE cluster_id=? AND user_id=? LIMIT 1", (cluster_id, uid)))


def reports_for(cluster_id: str, limit: int = 20) -> list[Report]:
    rows = q("SELECT data FROM reports WHERE cluster_id=? ORDER BY created_at DESC LIMIT ?", (cluster_id, limit))
    return [Report(**json.loads(r["data"])) for r in rows]


def wipe() -> None:
    for t in ("users", "clusters", "reports", "ledger", "events", "kv_meta"):
        x(f"DELETE FROM {t}")
    clusters.clear(); cells.clear(); _cell_of.clear()
    counters.clear(); counters.update(default_counters())
