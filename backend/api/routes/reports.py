"""Reports, confirmations, nearby, clusters."""
from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from contracts.models import (AgentStep, AIUsage, CategorySuggestion, Cluster, ClusterDetail, NearbyResult, ReportResult, TimelineEntry)
from backend.engine.geo import haversine_m
from backend.integrations.ai import suggest as ai_suggest, usage as ai_usage

from .. import adapters, edge, pipeline, store
from ..auth import require_staff

router = APIRouter()


@router.post("/reports", response_model=ReportResult)
async def post_report(lat: float = Form(...), lng: float = Form(...), accuracy_m: float = Form(20.0),
                      category: str = Form(""), note: str = Form(""), severity: str = Form(""),
                      demo_override: str = Form(""), photo: Optional[UploadFile] = File(None), x_user_id: str = Header("u_you")):
    data, ext = None, ".jpg"
    if photo is not None and photo.filename:
        data = await photo.read()
        ext = os.path.splitext(photo.filename)[1].lower() or ".jpg"
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".heic"):
            ext = ".jpg"
        if not data:
            data = None
    try:
        sev = int(severity) if severity.strip() else None
    except ValueError:
        sev = None
    return await pipeline.submit_report(x_user_id, lat, lng, accuracy_m, category or None, note, sev, data, ext,
                                       demo_override=demo_override.strip() == "1")


class ConfirmBody(BaseModel):
    lat: float = 0.0
    lng: float = 0.0
    accuracy_m: float = 20.0


@router.post("/clusters/{cluster_id}/confirm", response_model=ReportResult)
async def confirm(cluster_id: str, body: ConfirmBody, x_user_id: str = Header("u_you")):
    c = store.clusters.get(cluster_id)
    if c is None:
        raise HTTPException(404, "cluster not found")
    return await pipeline.submit_report(x_user_id, body.lat or c.lat, body.lng or c.lng, body.accuracy_m,
                                        c.category, "", None, None, confirm_cluster_id=cluster_id)


@router.get("/nearby", response_model=NearbyResult, dependencies=[Depends(require_staff)])
async def nearby(lat: float, lng: float, category: Optional[str] = None, radius_m: float = 100.0):
    found, info = edge.lookup(lat, lng, radius_m)
    out = []
    for c in found:
        d = haversine_m(lat, lng, c.lat, c.lng)
        if d <= radius_m and (not category or c.category == category):
            out.append((d, c))
    out.sort(key=lambda t: t[0])
    store.persist_counters()
    return NearbyResult(clusters=[c for _, c in out], edge=info)


@router.get("/clusters", response_model=list[Cluster], dependencies=[Depends(require_staff)])
async def list_clusters(status: Optional[str] = None, min_priority: float = 0.0, limit: int = 200):
    cs = [c for c in store.clusters.values()
          if (not status or c.status == status) and c.priority >= min_priority]
    cs.sort(key=lambda c: -c.priority)
    return cs[:limit]


@router.get("/clusters/{cluster_id}", response_model=ClusterDetail, dependencies=[Depends(require_staff)])
async def cluster_detail(cluster_id: str):
    c = store.clusters.get(cluster_id)
    if c is None:
        raise HTTPException(404, "cluster not found")
    tl = [TimelineEntry(**t) for t in json.loads(store.meta_get(f"tl:{cluster_id}") or "[]")]
    trace = []
    for s in json.loads(store.meta_get(f"trace:{cluster_id}") or "[]"):
        try:
            trace.append(AgentStep(**s))
        except Exception:
            pass
    return ClusterDetail(cluster=c, ticket=adapters.get_ticket(c.ticket_id), reports=store.reports_for(cluster_id),
                         timeline=tl, agent_trace=trace)


@router.get("/suggest", response_model=CategorySuggestion)
async def suggest_category(text: str = ""):
    return CategorySuggestion(**(await ai_suggest.suggest(text)))


@router.get("/ai-usage", response_model=AIUsage, dependencies=[Depends(require_staff)])
async def get_ai_usage():
    return AIUsage(**ai_usage.snapshot())
