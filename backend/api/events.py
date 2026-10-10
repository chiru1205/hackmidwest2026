"""SSE broker: ring buffer of the last 200 events, replay via ?since, EventSource-compatible."""
from __future__ import annotations

import asyncio
import json
from collections import deque

from contracts.models import Event

from . import store

ring: deque[Event] = deque(maxlen=200)
subs: set[asyncio.Queue] = set()
_next_id = 0


def init() -> None:
    global _next_id
    r = store.q("SELECT MAX(id) AS m FROM events")
    _next_id = int(r[0]["m"] or 0)


def publish(type_: str, data: dict | None = None) -> Event:
    global _next_id
    _next_id += 1
    ev = Event(id=_next_id, type=type_, ts=store.now_iso(), data=data or {})
    ring.append(ev)
    try:
        store.x("INSERT INTO events(id,type,ts,data) VALUES(?,?,?,?)",
                (ev.id, ev.type, ev.ts, json.dumps(ev.data, default=str)))
        if _next_id % 200 == 0:
            store.x("DELETE FROM events WHERE id < ?", (_next_id - 2000,))
    except Exception:
        pass
    for qu in list(subs):
        try:
            qu.put_nowait(ev)
        except asyncio.QueueFull:
            subs.discard(qu)
    return ev


def recent(limit: int = 50) -> list[Event]:
    return list(ring)[-limit:]


def clear() -> None:
    ring.clear()


async def stream(since: int | None):
    qu: asyncio.Queue = asyncio.Queue(maxsize=2000)
    subs.add(qu)
    try:
        last = since or 0
        if since is not None:
            for ev in list(ring):
                if ev.id > since:
                    last = ev.id
                    yield f"id: {ev.id}\ndata: {ev.model_dump_json()}\n\n"
        yield ": connected\n\n"
        while True:
            try:
                ev = await asyncio.wait_for(qu.get(), timeout=15)
            except asyncio.TimeoutError:
                yield ": ping\n\n"
                continue
            if ev.id <= last:
                continue
            last = ev.id
            yield f"id: {ev.id}\ndata: {ev.model_dump_json()}\n\n"
    finally:
        subs.discard(qu)
