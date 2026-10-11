"""Impact page numbers (city-facing, no vendor names) and the platform summary for the "Under the hood" judges' page."""
from __future__ import annotations

import asyncio
import os
import statistics

from fastapi import APIRouter, Depends

from contracts.models import AgentSplit, DistrictCount, ImpactFact, ImpactLive, PlatformInfo, PlatformPart

from .. import config, edge, store
from ..auth import require_staff
from .ops import impact as kc_impact

router = APIRouter(dependencies=[Depends(require_staff)])


def _counts() -> dict:
    """Case counts for the whole board (open, needs_you, agent_closed). Empty when the board is unavailable."""
    try:
        from backend.integrations.devrev import cases
        return cases.list_cases("needs", limit=1)["counts"]
    except Exception:
        return {}


def _tickets_in_devrev() -> int:
    try:
        from backend.integrations import devrev
        from backend.integrations.devrev import live
        if not live.configured():
            return 0
        return sum(1 for r in devrev.raw_rows() if r["devrev_id"])
    except Exception:
        return 0


def _tickets_opened() -> int:
    """One ticket per unique issue: the same population as the issue count, so the funnel reports -> issues -> tickets reads
    straight down. (How many of them are mirrored to the outside ticket system is a platform detail, not an impact number.)"""
    return sum(1 for c in store.clusters.values() if c.ticket_id)


def _districts() -> list[DistrictCount]:
    by: dict[str, int] = {}
    for c in store.clusters.values():
        extra = max(0, c.reporter_count - 1)
        if extra:
            label = c.district or "Unassigned"
            by[label] = by.get(label, 0) + extra
    return [DistrictCount(label=k, duplicates=v) for k, v in sorted(by.items(), key=lambda kv: (-kv[1], kv[0]))]


def _median_s() -> float | None:
    xs = store.latencies()
    return round(statistics.median(xs), 2) if xs else None


def _split(counts: dict) -> AgentSplit:
    closed = int(counts.get("agent_closed") or 0)
    open_ = int(counts.get("open") or 0)
    needs = min(int(counts.get("needs_you") or 0), open_)
    return AgentSplit(closed_by_agent=closed, on_track=open_ - needs, needs_person=needs, total=open_ + closed)


def live_numbers(facts: list[dict] | None = None) -> ImpactLive:
    reports = int(store.counters.get("total_reports", 0))
    unique = len(store.clusters)
    return ImpactLive(as_of=store.now_iso(), reports=reports, unique_issues=unique,
                      duplicates_avoided=max(0, reports - unique), tickets_in_devrev=_tickets_opened(),
                      median_report_to_ticket_s=_median_s(), districts=_districts(), split=_split(_counts()),
                      facts=[ImpactFact(**f) for f in facts or []])


@router.get("/impact/live", response_model=ImpactLive)
async def impact_live():
    facts = (await kc_impact())["facts"]      # the same real Kansas City facts as GET /api/impact
    return await asyncio.to_thread(live_numbers, facts)


# ---------------------------------------------------------------- platform
def _part(name: str, provider: str, role: str, usage: dict | None = None, detail: str = "", tracked: bool = True) -> PlatformPart:
    """tracked=False: nothing counts calls for this part, so calls, errors and avg_ms are -1 ("not tracked"), never a false 0."""
    u = usage or {}
    if not tracked:
        return PlatformPart(name=name, provider=provider, role=role, calls=-1, errors=-1, avg_ms=-1, detail=detail)
    return PlatformPart(name=name, provider=provider, role=role, calls=int(u.get("calls", 0)),
                        errors=int(u.get("errors", 0)), avg_ms=int(u.get("avg_ms", 0)), detail=detail)


LOCAL_HOSTING = "Local (not deployed)"


def hosting_string() -> str:
    """Where the API runs. Only claimed when PLATFORM_HOSTING says so; otherwise this is a local run."""
    base = (os.getenv("PLATFORM_HOSTING") or "").strip()
    if not base:
        return LOCAL_HOSTING
    region = (os.getenv("PLATFORM_REGION") or "").strip()
    return f"{base}, {region}" if region else base


VISION_PROVIDERS = {"bedrock": "AWS Bedrock", "anthropic": "Anthropic", "": "Not configured"}


def _vision_provider() -> str:
    from backend.agents import verify, vision
    for cache in (getattr(vision, "_model_cache", None), getattr(verify, "_vision_cache", None)):
        if cache and cache[0] is not None and len(cache) > 1:  # a client was built: this is the provider that answered
            return VISION_PROVIDERS.get(cache[1], "Not configured")
    return VISION_PROVIDERS[vision.configured_provider()]


def platform_info() -> PlatformInfo:
    from backend.integrations.ai import usage
    by_name = {m["name"]: m for m in usage.snapshot()["models"]}
    kinds = {k: by_name.get(name) for k, (name, _p) in usage.MODELS.items()}
    flags = config.flags
    hosting = hosting_string()
    provider = _vision_provider()
    try:
        from backend.agents import verify
        autonomy = "off" if verify.get_policy().mode == "off" else "on"
    except Exception:
        autonomy = "unknown"

    mirrored = _tickets_in_devrev()
    hits, misses = int(store.counters.get("edge_hits", 0)), int(store.counters.get("edge_misses", 0))
    n = int(store.counters.get("edge_n", 0))
    avg_edge = store.counters.get("edge_ms_sum", 0.0) / n if n else 0.0
    backend = getattr(edge.kv, "backend", "memory")
    cache_name = "Valkey" if backend == "valkey" else "In-memory"

    parts = [
        _part("Hosted embeddings", "Akamai", "Semantic duplicate matching and category suggestions", kinds["embedding"],
              kinds["embedding"] and kinds["embedding"]["name"] or ""),
        _part("Hosted chat", "Akamai",
              "Agents that judge duplicates, write priority reasons and decide fix verdicts", kinds["chat"],
              kinds["chat"] and kinds["chat"]["name"] or ""),
        _part("Image generation", "Akamai", "Badge artwork", kinds["image"],
              kinds["image"] and kinds["image"]["name"] or ""),
        _part("Vision", provider, "Reads report and repair photos", kinds["vision"],
              f"New-report photos: {'on' if flags.vision else 'off'}. Repair verification: {'on' if provider != 'Not configured' else 'off'}"),
        _part("Agent framework", "Strands", "Runs the report and verification agents", None,
              ("Report agents: on. " if flags.agents_mode == "graph" else "Report agents: inactive (deterministic mode). ")
              + f"Fix verification: {autonomy}", tracked=False),
        _part("Ticketing", "DevRev", "The city's ticket system: every issue becomes a work item",
              None, f"{flags.devrev_mode}, {mirrored} tickets mirrored" if flags.devrev_mode == "live"
              else f"{flags.devrev_mode}, no tickets mirrored", tracked=False),
        _part("Cloud hosting", "Local" if hosting == LOCAL_HOSTING else "Akamai Cloud", "Runs the API and the apps", None,
              hosting, tracked=False),
        PlatformPart(name="Geo cache", provider=cache_name, role="Finds nearby issues by map cell before any model runs",
                     calls=hits + misses, errors=0, avg_ms=round(avg_edge), detail=f"{backend}, {avg_edge:.2f} ms average"),
    ]
    return PlatformInfo(as_of=store.now_iso(), parts=parts, semantic_merges=int(store.counters.get("semantic_merges", 0)),
                        hosting=hosting, agents_mode=flags.agents_mode, devrev_mode=flags.devrev_mode)


@router.get("/platform", response_model=PlatformInfo)
async def platform():
    return await asyncio.to_thread(platform_info)
