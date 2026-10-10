"""Akamai hosted embeddings. embed(texts) -> list of vectors, or None on ANY failure (never raises).

Batches of up to 16 per request, shares the chat token bucket, 8 s timeout, and caches vectors in a small
SQLite table (sha256(model+text) -> float32 blob) in DB_PATH so repeated texts cost nothing.
"""
from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
import threading
import time
from array import array
from pathlib import Path

import httpx

from . import _bucket, has_key, usage

log = logging.getLogger("civicflow.embed")
BATCH = 16
TIMEOUT_S = 8.0
_ROOT = Path(__file__).resolve().parents[3]
_lock = threading.Lock()
_db: sqlite3.Connection | None = None
_db_path: str | None = None


def _model() -> str:
    return os.getenv("AKAMAI_EMBED_MODEL") or "hackathon-embedding"


def enabled() -> bool:
    return has_key() and os.getenv("EMBED_DISABLED", "").lower() not in ("1", "true", "on", "yes")


def _conn() -> sqlite3.Connection:
    global _db, _db_path
    path = os.getenv("DB_PATH") or str(_ROOT / "data" / "civicflow.db")
    if _db is None or _db_path != path:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        _db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        _db.execute("PRAGMA journal_mode=WAL")
        _db.execute("CREATE TABLE IF NOT EXISTS embed_cache(h TEXT PRIMARY KEY, vec BLOB, ts REAL)")
        _db_path = path
    return _db


def _key(text: str) -> str:
    return hashlib.sha256(f"{_model()}\n{text}".encode("utf-8")).hexdigest()


def _cache_get(texts: list[str]) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}
    try:
        with _lock:
            c = _conn()
            for t in texts:
                row = c.execute("SELECT vec FROM embed_cache WHERE h=?", (_key(t),)).fetchone()
                if row:
                    a = array("f")
                    a.frombytes(row[0])
                    out[t] = list(a)
    except Exception as e:
        log.warning("embed cache read failed: %s", type(e).__name__)
    return out


def _cache_put(pairs: dict[str, list[float]]) -> None:
    try:
        with _lock:
            c = _conn()
            for t, v in pairs.items():
                c.execute("INSERT OR REPLACE INTO embed_cache(h,vec,ts) VALUES(?,?,?)",
                          (_key(t), array("f", v).tobytes(), time.time()))
    except Exception as e:
        log.warning("embed cache write failed: %s", type(e).__name__)


async def _request(batch: list[str]) -> list[list[float]] | None:
    base = os.getenv("AKAMAI_AI_BASE_URL") or "https://ws.akamai-workshops.com/v1"
    if not _bucket.try_take():
        log.warning("akamai rate limit bucket empty (embeddings)")
        return None
    t0 = time.perf_counter()
    ok, tokens = False, None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            r = await client.post(base.rstrip("/") + "/embeddings",
                                  headers={"Authorization": f"Bearer {os.getenv('AKAMAI_AI_KEY', '')}"},
                                  json={"model": _model(), "input": batch})
        if r.status_code != 200:
            log.warning("akamai embeddings HTTP %s", r.status_code)
            return None
        body = r.json()
        data = sorted(body["data"], key=lambda d: d.get("index", 0))
        vecs = [[float(x) for x in d["embedding"]] for d in data]
        if len(vecs) != len(batch):
            return None
        tokens = (body.get("usage") or {}).get("total_tokens")
        ok = True
        return vecs
    except Exception as e:
        log.warning("akamai embeddings failed: %s", type(e).__name__)
        return None
    finally:
        usage.record("embedding", ok, (time.perf_counter() - t0) * 1000, tokens)


async def embed(texts: list[str]) -> list[list[float]] | None:
    """Vectors in the same order as `texts`, or None if any text could not be embedded."""
    if not texts or not enabled():
        return None
    try:
        texts = [(t or "").strip()[:2000] or "." for t in texts]
        have = _cache_get(list(dict.fromkeys(texts)))
        missing = [t for t in dict.fromkeys(texts) if t not in have]
        for i in range(0, len(missing), BATCH):
            chunk = missing[i:i + BATCH]
            vecs = await _request(chunk)
            if vecs is None:
                return None
            got = dict(zip(chunk, vecs))
            _cache_put(got)
            have.update(got)
        return [have[t] for t in texts]
    except Exception as e:
        log.warning("embed failed: %s", type(e).__name__)
        return None
