"""Ops analytics: work-order outcomes (DevRev) and app metrics (Civic Flow)."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from backend.integrations.devrev import analytics
from .. import store

router = APIRouter()
log = logging.getLogger("civicflow.analytics")

LABELS = {
    "chat": "Akamai chat", "embeddings": "Akamai embeddings", "embedding": "Akamai embeddings",
    "image": "Akamai image", "images": "Akamai image", "vision": "AWS Bedrock vision",
}


def _ai_usage() -> list[dict]:
    try:
        from backend.integrations.ai import usage
    except Exception:
        return []
    try:
        raw = None
        for name in ("snapshot", "summary", "stats", "get_usage", "usage"):
            fn = getattr(usage, name, None)
            if callable(fn):
                raw = fn()
                break
        if isinstance(raw, dict) and isinstance(raw.get("models"), list):
            raw = [{"label": f"{m.get('provider')} {str(m.get('name')).replace('hackathon-', '').replace('bedrock ', '')}", **m} for m in raw["models"]]
        elif isinstance(raw, dict):
            raw = raw.get("items") or raw.get("providers") or [{"kind": k, **v} for k, v in raw.items() if isinstance(v, dict)]
        out = []
        for r in raw or []:
            if not isinstance(r, dict):
                r = r.model_dump() if hasattr(r, "model_dump") else dict(vars(r))
            kind = str(r.get("kind") or r.get("provider") or r.get("name") or r.get("label") or "")
            label = r.get("label") or LABELS.get(kind.lower(), kind)
            out.append({"label": label, "calls": int(r.get("calls") or r.get("count") or 0),
                        "avg_ms": round(float(r.get("avg_ms") or r.get("avg_latency_ms") or 0), 1),
                        "errors": int(r.get("errors") or 0)})
        return out
    except Exception:
        log.exception("ai usage unavailable")
        return []


@router.get("/analytics/work-orders")
async def work_orders():
    return await asyncio.to_thread(analytics.snapshot)


@router.get("/analytics/app")
async def app_metrics():
    s = store.stats()
    lookups = s.edge_hits + s.edge_misses
    total = s.total_reports
    return {
        "source": "Civic Flow",
        "total_reports": total, "unique_issues": s.unique_clusters, "duplicates_absorbed": s.duplicates_absorbed,
        "dedup_ratio": round(s.duplicates_absorbed / total, 4) if total else 0.0,
        "llm_calls_avoided": s.llm_calls_avoided,
        "geo_cache_hit_rate": round(s.edge_hits / lookups, 4) if lookups else None,
        "geo_cache_lookups": lookups, "geo_cache_avg_ms": s.avg_edge_ms,
        "vision_reports": None,
        "ai_usage": await asyncio.to_thread(_ai_usage),
    }
