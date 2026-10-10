"""Admin: simulate, reset, flags."""
from __future__ import annotations

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
        from backend.integrations.devrev import baseline, events as dr_events
        dr_events.clear_all()
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
