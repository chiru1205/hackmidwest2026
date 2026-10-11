"""Admin: simulate, reset, flags."""
from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, Body, Depends

from contracts.models import Flags, SimulateRequest

from ..auth import require_staff
from .. import adapters, config, edge, events, pipeline, seed, simulate, store

router = APIRouter(dependencies=[Depends(require_staff)])


@router.post("/admin/simulate")
async def admin_simulate(req: SimulateRequest = Body(default_factory=SimulateRequest)):
    simulate.start(req)
    return {"started": True}


def do_reset(reseed: bool = True) -> None:
    simulate.cancel_all()
    edge.reset_kv()
    adapters.reset_tickets()
    store.wipe()
    events.clear()
    try:
        from backend.integrations.devrev import baseline, board, events as dr_events
        dr_events.clear_all()
        board.clear_after_photos()    # seeded case ids repeat: a leftover after-photo would count as evidence for a fresh case
    except Exception:
        baseline = None
    if reseed:
        seed.seed()
        if baseline is not None:
            baseline.schedule_restore()    # background; best effort; live mode only
    events.publish("reset", {})
    pipeline.publish_stats()


@router.post("/admin/reset")
async def admin_reset():
    do_reset()
    simulate.cancel_flag = False
    return {"ok": True}


@router.get("/admin/flags", response_model=Flags)
async def get_flags():
    return config.flags


@router.post("/admin/flags", response_model=Flags)
async def set_flags(patch: dict = Body(default_factory=dict)):
    allowed = set(Flags.model_fields)
    return config.set_flags({k: v for k, v in patch.items() if k in allowed and v is not None})


@router.post("/admin/warmup")
async def admin_warmup():
    """Warm every model connection (embeddings, hosted chat, vision, case search) WITHOUT creating a report or a ticket.
    The first call after a restart can be slow or time out; scripts/demo_prep.ps1 runs this before the demo."""
    out: dict[str, dict] = {}

    async def timed(name: str, coro, limit: float = 40.0) -> None:
        t0 = time.perf_counter()
        try:
            ok = bool(await asyncio.wait_for(coro, limit))
        except Exception:
            ok = False
        out[name] = {"ok": ok, "ms": round((time.perf_counter() - t0) * 1000)}

    async def _embed() -> bool:
        from backend.integrations.ai import embed
        return embed.enabled() and await embed.embed([f"warm up {time.time()}"]) is not None

    async def _chat() -> bool:
        from backend.agents.common import akamai_key, build_akamai_agent
        from backend.integrations.ai import usage
        if not akamai_key():
            return False
        t0 = time.perf_counter()
        ok = False
        try:
            agent = build_akamai_agent("Reply with the single word OK.", max_tokens=8)
            ok = bool(await agent.invoke_async("ping"))
        finally:
            usage.record("chat", ok, (time.perf_counter() - t0) * 1000)
        return ok

    async def _vision() -> bool:
        from backend.agents import vision
        if not vision.vision_on():
            return False
        data = (config.PHOTO_DIR / "seed" / "pothole_01.jpg").read_bytes()
        tri, _ = await vision.triage_photo(data, "", None)
        return tri is not None

    async def _search() -> bool:
        from backend.integrations.devrev import case_search
        case_search.warm_once()
        return True

    await timed("embeddings", _embed())
    await timed("chat", _chat())
    await timed("vision", _vision())
    await timed("case_search", _search())
    try:
        from backend.agents import verify
        verify.warm()
    except Exception:
        pass
    return {"ok": all(v["ok"] for v in out.values()), "steps": out}
