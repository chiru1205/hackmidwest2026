"""Tickets, vendor orders, stats, impact, events, health."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from contracts.models import Cluster, Event, Health, Stats, Ticket, VendorOrder
from .. import adapters, config, events, pipeline, store
from ..auth import require_staff, require_staff_events

router = APIRouter()
DUE_DAYS = {"P1": 2, "P2": 5, "P3": 10, "P4": 14}


@router.get("/health", response_model=Health)
async def health():
    return Health(status="ok", flags=config.flags, services=adapters.services())


@router.get("/stats", response_model=Stats, dependencies=[Depends(require_staff)])
async def get_stats():
    return store.stats()


@router.get("/tickets", response_model=list[Ticket], dependencies=[Depends(require_staff)])
async def tickets():
    return adapters.list_tickets(300)


class AdvanceBody(BaseModel):
    stage: str


@router.post("/tickets/{ticket_id}/advance", response_model=Ticket, dependencies=[Depends(require_staff)])
async def advance(ticket_id: str, body: AdvanceBody):
    if body.stage not in ("queued", "work_in_progress", "resolved", "canceled"):
        raise HTTPException(422, "bad stage")
    t = adapters.set_stage(ticket_id, body.stage)
    if t is None:
        raise HTTPException(404, "ticket not found")
    c = store.clusters.get(t.cluster_id)
    if c is not None:
        if body.stage == "resolved":
            pipeline.mark_fixed(c, set_ticket=False)
        elif body.stage == "work_in_progress":
            pipeline.set_status(c, "in_progress", "Work started")
        elif body.stage == "queued":
            pipeline.set_status(c, "assigned" if c.vendor else "reported", "Queued")
        t = adapters.get_ticket(ticket_id) or t
    events.publish("ticket.updated", {"ticket": t.model_dump(mode="json")})
    pipeline.publish_stats()
    return t


@router.get("/vendor/orders", response_model=list[VendorOrder], dependencies=[Depends(require_staff)])
async def vendor_orders(vendor: Optional[str] = None):
    from backend.integrations.devrev import live as dr_live
    only_devrev = dr_live.configured()  # live DevRev: vendors see only work orders that really exist in DevRev
    out = []
    for c in sorted(store.clusters.values(), key=lambda c: -c.priority):
        if c.status == "fixed" or not c.vendor:
            continue
        if vendor and vendor.lower() not in c.vendor.lower():
            continue
        ticket = adapters.get_ticket(c.ticket_id)
        if only_devrev and not any(t.startswith("devrev:") for t in (ticket.tags if ticket else [])):
            continue
        try:
            due = datetime.fromisoformat(c.first_reported_at.replace("Z", "+00:00")) + timedelta(days=DUE_DAYS[c.bucket])
        except Exception:
            due = datetime.now(timezone.utc)
        out.append(VendorOrder(cluster=c, ticket=ticket,
                               due=due.isoformat().replace("+00:00", "Z")))
    return out


@router.post("/vendor/orders/{cluster_id}/fix", response_model=Cluster, dependencies=[Depends(require_staff)])
async def vendor_fix(cluster_id: str, photo: Optional[UploadFile] = File(None)):
    c = store.clusters.get(cluster_id)
    if c is None:
        raise HTTPException(404, "cluster not found")
    if photo is not None and photo.filename:
        data = await photo.read()
        if data:
            adapters.save_photo(f"fix_{cluster_id}.jpg", data)
    was_open = c.status != "fixed"
    out = pipeline.mark_fixed(c)
    if was_open and c.ticket_id:  # log the vendor fix (and its after-photo) in the ticket event history
        try:
            from backend.integrations.devrev import events as dr_events
            dr_events.record("resolved", c.ticket_id, None,
                             "Vendor marked fixed" + (" with an after-photo" if photo is not None and photo.filename else ""),
                             "Civic Flow")
        except Exception:
            pass
    return out


@router.get("/impact")
async def impact():
    f = lambda label, value, note, source, est=False: {"label": label, "value": value, "note": note,
                                                          "estimate": est, "source": source}
    return {
        "headline": "Many reports, one ticket, for any city issue.",
        "facts": [
            f("Kansas City 311 requests in 2025", "about 167,089",
              "All request types, not only potholes (potholes were the 4th most common type)", "data.kcmo.org d4px-6rwg"),
            f("Pothole requests repeated within 50 m and 30 days", "about 28%",
              "Our analysis of the open data; other issue types were not measured", "data.kcmo.org d4px-6rwg", True),
            f("Median days to close a pothole", "13 (90th percentile 51)",
              "Pothole requests closed in KC; one example issue type", "data.kcmo.org d4px-6rwg"),
            f("Pothole requests in 2025 (one example type)", "about 9,700", "Kansas City 311 service requests",
              "data.kcmo.org d4px-6rwg"),
            f("Canceled pothole requests, 2025", "30%", "Many are duplicates or already known (pothole example)",
              "data.kcmo.org d4px-6rwg"),
            f("NYC potholes formally closed as duplicates", "8.8%", "NYC 311 closure codes (pothole example)", "NYC Open Data 311"),
            f("Average US pothole repair cost to drivers", "about $600", "Per vehicle repair (pothole example)", "AAA"),
            f("Extra yearly cost of poor roads, KC driver", "$704", "Vehicle operating costs (road condition example)",
              "TRIP 2020"),
        ],
    }


@router.get("/events", dependencies=[Depends(require_staff_events)])
async def sse(since: Optional[int] = Query(None), last_event_id: Optional[str] = Header(None)):
    if since is None and last_event_id and last_event_id.isdigit():
        since = int(last_event_id)
    return StreamingResponse(events.stream(since), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


@router.get("/events/recent", response_model=list[Event], dependencies=[Depends(require_staff)])
async def recent(limit: int = 50):
    return events.recent(limit)
