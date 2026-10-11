"""Semantic search over the Workflow page cases: hosted embeddings of each open case's text, cosine against the query.

The index is built lazily in a background thread, in small batches with a pause between them (the Akamai key is shared
at 60 requests/min across the team), only for open cases (most urgent first, capped), and kept in memory keyed by case
id + text hash. Nothing here ever blocks a request on the index: when it is not ready, or embeddings are unavailable,
`semantic_hits` returns [] and the caller keeps the plain substring search.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import threading
import time

from backend.engine.semantic import cosine
from backend.integrations.ai import embed
from backend.integrations.ai.suggest import CATEGORY_TEXT

log = logging.getLogger("civicflow.case_search")

MIN_Q = 3               # shorter queries are plain substring only
CAP = 400               # most urgent open cases that get a vector
BATCH = embed.BATCH     # texts per embeddings request (one request each)
PACE_S = 2.0            # pause between batches: a full 400-case build stays near 30 requests/min
RETRY_S = 60.0          # after a failed build step, wait this long before trying again
QUERY_BUDGET_S = 3.0    # most a search waits for the query vector
QUERY_DOWN_S = 20.0     # after a failed query embedding, skip semantic for this long
# Chosen from real vectors (16 cases x 16 queries, hosted embedding model): right answers scored 0.51-0.69, queries that
# match nothing ("refund for my parking ticket", "dog barking all night", "bakery opening hours") peaked at 0.38-0.45.
MIN_SIM = 0.50          # cosine at or above which a case counts as a match
BAND = 0.06             # ...and within this of the best match, so one strong hit is not buried in weak ones
MAX_HITS = 100

_ID_LIKE = re.compile(r"^(tkt|cf|c)[-_ ]?\d+$", re.I)
_TEMPLATE = re.compile(r"^Priority P\d", re.I)

_lock = threading.Lock()
_index: dict[str, tuple[str, list[float]]] = {}   # case id -> (text hash, vector)
_state = {"building": False, "ready": False, "retry_at": 0.0, "query_down_until": 0.0, "warmed": False}
_pace = PACE_S


def reset() -> None:
    """Forget the index (tests, and a changed embedding model)."""
    with _lock:
        _index.clear()
        _state.update(building=False, ready=False, retry_at=0.0, query_down_until=0.0, warmed=False)


# ---------------------------------------------------------------- text
def case_text(t: dict, c) -> str:
    """What a case says about itself: category and a plain description of it, where, the hazard, the zone, the rationale."""
    from backend.api import adapters
    cat = getattr(c, "category", "") or ""
    label = adapters.LABELS.get(cat, cat.replace("_", " "))
    desc = (CATEGORY_TEXT.get(cat) or ("",))[:2][-1]
    where = ", ".join(x for x in (getattr(c, "address", None), t.get("neighborhood"), t.get("district")) if x)
    why = " ".join(s.strip() for s in re.split(r"(?<=\.)\s+", getattr(c, "rationale", "") or "") if s.strip() and not _TEMPLATE.match(s.strip()))
    parts = [f"{label}. {desc}" if desc else label, where,
             (getattr(c, "hazard_description", "") or "").strip(),
             "Safety hazard" if getattr(c, "is_hazard", False) else "",
             "; ".join(t.get("zones") or ""), why[:160]]
    return ". ".join(p.rstrip(". ") for p in parts if p)[:600]


def _digest(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------- index
def _wanted(open_rows: list[tuple[dict, str]]) -> dict[str, str]:
    """case id -> text for the most urgent open cases, in the order given (the caller sorts by urgency)."""
    return {t["id"]: text for t, text in open_rows[:CAP]}


async def _build(todo: list[tuple[str, str]]) -> None:
    ok = True
    try:
        for i in range(0, len(todo), BATCH):
            chunk = todo[i:i + BATCH]
            vecs = await embed.embed([text for _, text in chunk])
            if vecs is None:
                ok = False
                break
            with _lock:
                for (cid, text), v in zip(chunk, vecs):
                    _index[cid] = (_digest(text), v)
            if i + BATCH < len(todo):
                await asyncio.sleep(_pace)
    except Exception as e:
        ok = False
        log.warning("case index build failed: %s", type(e).__name__)
    with _lock:
        _state["building"] = False
        if ok:
            _state["ready"] = True
        else:
            _state["retry_at"] = time.monotonic() + RETRY_S


def _run(todo: list[tuple[str, str]]) -> None:
    asyncio.run(_build(todo))


def ensure_index(open_rows: list[tuple[dict, str]]) -> bool:
    """Start (at most one) background build for cases without a current vector. True when the index is usable now."""
    if not embed.enabled():
        return False
    want = _wanted(open_rows)
    with _lock:
        for cid in [k for k in _index if k not in want]:   # closed or dropped cases free their vectors
            del _index[cid]
        todo = [(cid, text) for cid, text in want.items() if _index.get(cid, ("",))[0] != _digest(text)]
        if todo and not _state["building"] and time.monotonic() >= _state["retry_at"]:
            _state["building"] = True
            threading.Thread(target=_run, args=(todo,), daemon=True, name="case-index").start()
        elif not todo and not _state["building"]:
            _state["ready"] = True
        return _state["ready"]


def warm_once() -> None:
    """The first time the case list is opened in this process, start the index build in the background, so the first
    search does not find an empty index. Never blocks and never raises."""
    if _state["warmed"] or not embed.enabled():
        return
    _state["warmed"] = True

    def _go() -> None:
        try:
            from . import board, cases
            tickets, _source, _as_of = board.all_tickets()
            cl = board._clusters()
            urgent = sorted(((t, []) for t in tickets if t["stage_key"] != "resolved" and t["cluster_id"] in cl), key=cases._urgency)
            ensure_index([(t, case_text(t, cl[t["cluster_id"]])) for t, _ in urgent[:CAP]])
        except Exception as e:
            log.warning("case index warm-up failed: %s", type(e).__name__)

    threading.Thread(target=_go, daemon=True, name="case-index-warm").start()


# ---------------------------------------------------------------- query
def _embed_query(q: str) -> list[float] | None:
    """One cached embeddings request, never longer than QUERY_BUDGET_S. Runs in the request's worker thread."""
    if time.monotonic() < _state["query_down_until"]:
        return None
    try:
        vecs = asyncio.run(asyncio.wait_for(embed.embed([q]), QUERY_BUDGET_S))
    except Exception as e:
        log.warning("case query embedding failed: %s", type(e).__name__)
        vecs = None
    if not vecs:
        _state["query_down_until"] = time.monotonic() + QUERY_DOWN_S
        return None
    return vecs[0]


def wants_semantic(q: str, tickets: list[dict]) -> bool:
    """Long enough, not an id lookup, and no case id matches exactly."""
    q = (q or "").strip()
    if len(q) < MIN_Q or _ID_LIKE.match(q):
        return False
    low = q.lower()
    return not any(low in ((t.get("id") or "").lower(), (t.get("devrev_id") or "").lower()) for t in tickets)


def semantic_hits(q: str, allowed: set[str], open_rows: list[tuple[dict, str]]) -> list[tuple[str, float]]:
    """(case id, cosine) best first, for indexed cases in `allowed` that clear the threshold. [] when not available."""
    if not embed.enabled() or not ensure_index(open_rows):
        return []
    with _lock:
        snap = {cid: v for cid, (_, v) in _index.items() if cid in allowed}
    if not snap:
        return []
    qv = _embed_query(q)
    if qv is None:
        return []
    scored = sorted(((cid, cosine(qv, v)) for cid, v in snap.items()), key=lambda x: -x[1])
    if not scored or scored[0][1] < MIN_SIM:
        return []
    floor = max(MIN_SIM, scored[0][1] - BAND)
    return [(cid, round(s, 4)) for cid, s in scored if s >= floor][:MAX_HITS]
