"""Live case-flow board backed by DevRev: board, one ticket's journey, actions, events."""
from __future__ import annotations

import asyncio
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from backend.agents import verify
from backend.integrations.devrev import actions, board, case_search, cases, events
from contracts.models import AutonomyPolicy

from ..auth import require_staff

router = APIRouter(dependencies=[Depends(require_staff)])
verify.warm()  # the first fix check should not pay for importing Strands


class ActionBody(BaseModel):
    action: str
    note: Optional[str] = None


class AutonomyBody(BaseModel):
    mode: Literal["off", "suggest", "auto"]



@router.get("/devrev/board")
async def get_board():
    return await asyncio.to_thread(board.build)


@router.get("/devrev/ticket/{ticket_id}/journey")
async def get_journey(ticket_id: str):
    j = await asyncio.to_thread(board.journey, ticket_id)
    if j is None:
        raise HTTPException(404, "ticket not found")
    return j


@router.get("/devrev/cases")
async def get_cases(group: str = Query("needs", pattern="^(needs|new|approval|overdue|escalated|no_crew|all)$"),
                    q: str = "", district: str = "", limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)):
    if not q.strip():
        case_search.warm_once()  # opening the list is the cue to build the smart-search index, so the first search is not empty
    return await asyncio.to_thread(cases.list_cases, group, q, district, limit, offset)


@router.get("/devrev/ticket/{ticket_id}/case")
async def get_case(ticket_id: str):
    try:
        return await asyncio.to_thread(cases.case_detail, ticket_id)
    except cases.NotFound:
        raise HTTPException(404, "ticket not found")


@router.post("/devrev/ticket/{ticket_id}/action")
async def post_action(ticket_id: str, body: ActionBody):
    return await actions.run(ticket_id, body.action, body.note)


@router.get("/devrev/events")
async def get_events(limit: int = Query(30, ge=1, le=200)):
    return events.recent(limit)


@router.get("/devrev/autonomy", response_model=AutonomyPolicy)
async def get_autonomy():
    return await asyncio.to_thread(verify.get_policy, True)


@router.post("/devrev/autonomy", response_model=AutonomyPolicy)
async def post_autonomy(body: AutonomyBody):
    pol = await asyncio.to_thread(verify.set_mode, body.mode)
    if pol.mode != "off":
        verify.resume_pending()  # cases that reached verification while checks were off get their check now
    return pol


@router.post("/devrev/ticket/{ticket_id}/after-photo")
async def post_after_photo(ticket_id: str, photo: UploadFile = File(...)):
    """Attach the crew's after-photo (evidence) without closing the case. Awaiting verification: the agent checks it."""
    def fail(msg: str) -> dict:
        return {"ok": False, "after_photo_url": None, "error": msg}

    try:
        cf_id = await asyncio.to_thread(cases._cf_id, ticket_id)
    except cases.NotFound:
        raise HTTPException(404, "ticket not found")
    cw = await asyncio.to_thread(board.current_work, cf_id)
    if cw is None:
        raise HTTPException(404, "ticket not found")
    cluster = cw[1]
    # evidence belongs to an open fix cycle: a closed, canceled or not yet started case keeps the photo it has
    meta = await asyncio.to_thread(events.get_meta, cf_id)
    key = board.stage_key(cw[2]["stage"], bool(cluster.vendor) and cluster.status == "assigned", meta["awaiting"])
    if key not in ("in_progress", "awaiting_verification"):
        return fail("An after-photo can only be added while work is in progress or awaiting verification")
    data = await photo.read(actions.MAX_PHOTO_BYTES + 1)
    err = await asyncio.to_thread(actions.photo_error, data)
    if err:
        return fail(err)
    url = await asyncio.to_thread(actions.save_after_photo, cluster.id, data)
    board.invalidate()
    if meta["awaiting"] and cluster.status != "fixed":
        verify.schedule(cf_id)  # no-op when the autonomy mode is off; a check in flight reruns for the new photo
    return {"ok": True, "after_photo_url": url, "error": None}
