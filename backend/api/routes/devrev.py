"""Live case-flow board backed by DevRev: board, one ticket's journey, actions, events."""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.integrations.devrev import actions, board, events

router = APIRouter()


class ActionBody(BaseModel):
    action: str
    note: Optional[str] = None


@router.get("/devrev/board")
async def get_board():
    return await asyncio.to_thread(board.build)


@router.get("/devrev/ticket/{ticket_id}/journey")
async def get_journey(ticket_id: str):
    j = await asyncio.to_thread(board.journey, ticket_id)
    if j is None:
        raise HTTPException(404, "ticket not found")
    return j


@router.post("/devrev/ticket/{ticket_id}/action")
async def post_action(ticket_id: str, body: ActionBody):
    return await actions.run(ticket_id, body.action, body.note)


@router.get("/devrev/events")
async def get_events(limit: int = Query(30, ge=1, le=200)):
    return events.recent(limit)
