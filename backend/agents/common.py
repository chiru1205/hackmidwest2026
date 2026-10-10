"""Shared helpers for the agents layer: step emitting, text templates, Akamai-backed Strands agents."""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Callable

from dotenv import load_dotenv

from contracts.models import AgentStep, Cluster, Report

load_dotenv()
log = logging.getLogger("civicflow.agents")
Emit = Callable[[str, dict], None]
LLM_TIMEOUT_S = 12.0


def agents_mode() -> str:
    return os.getenv("AGENTS_MODE", "det").lower()


def akamai_key() -> str:
    return os.getenv("AKAMAI_AI_KEY", "")


def graph_enabled() -> bool:
    return agents_mode() == "graph" and bool(akamai_key())


def chat_model_name() -> str:
    return os.getenv("AKAMAI_CHAT_MODEL") or "hackathon-chat"


def step(emit: Emit, node: str, status: str, report_id: str = "", cluster_id: str = "",
         ms: float = 0.0, summary: str = "", model: str | None = None) -> None:
    """Emit an agent.node event (AgentStep fields + report_id/cluster_id). Never raises."""
    try:
        data = AgentStep(node=node, status=status, ms=round(ms, 1), summary=summary, model=model).model_dump()
        data.update({"report_id": report_id, "cluster_id": cluster_id})
        emit("agent.node", data)
    except Exception as e:
        log.warning("emit failed: %s", e)


def elapsed_ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000.0


def label(category: str) -> str:
    return category.replace("_", " ").capitalize()


def where(cluster: Cluster) -> str:
    return cluster.address or f"{cluster.lat:.5f},{cluster.lng:.5f}"


def map_link(cluster: Cluster) -> str:
    return f"https://www.openstreetmap.org/?mlat={cluster.lat}&mlon={cluster.lng}"


def template_title(cluster: Cluster) -> str:
    n = cluster.reporter_count
    return f"{label(cluster.category)} near {where(cluster)} - {n} report{'s' if n != 1 else ''}"


def template_body(cluster: Cluster, report: Report | None = None) -> str:
    lines = [
        f"Category: {cluster.category}",
        f"Severity: {cluster.severity}/5 (priority {cluster.bucket}, score {cluster.priority:.0f})",
        f"Hazard: {'yes - ' + cluster.hazard_description if cluster.is_hazard else 'no'}",
        f"Unique reporters: {cluster.reporter_count}",
        f"Location: {where(cluster)}" + (f" ({cluster.neighborhood})" if cluster.neighborhood else ""),
        f"Map: {map_link(cluster)}",
    ]
    if report and report.note:
        lines.append(f"Citizen note: {report.note}")
    return "\n".join(lines)


def template_rationale(cluster: Cluster) -> str:
    parts = [f"Severity {cluster.severity}/5",
             f"{cluster.reporter_count} unique reporter{'s' if cluster.reporter_count != 1 else ''}"]
    if cluster.is_hazard:
        parts.append("safety hazard")
    if cluster.location_crit >= 0.8:
        parts.append("high-criticality location")
    for z in getattr(cluster, "zones", None) or []:
        kind, _, name = z.partition(": ")
        parts.append(("on an arterial corridor" if kind.startswith("Arterial") else f"inside a {kind.lower()}") + (f": {name}" if name else ""))
    return f"{cluster.bucket} (score {cluster.priority:.0f}): " + ", ".join(parts) + "."


def cluster_facts(cluster: Cluster, report: Report | None = None) -> str:
    return (f"category={cluster.category}; severity={cluster.severity}/5; hazard={cluster.is_hazard} "
            f"({cluster.hazard_description}); unique_reporters={cluster.reporter_count}; "
            f"location_criticality={cluster.location_crit}; priority_score={cluster.priority:.0f}; bucket={cluster.bucket}; "
            f"address={where(cluster)}; neighborhood={cluster.neighborhood}; district={getattr(cluster, 'district', None)}; "
            f"priority_zones={'; '.join(getattr(cluster, 'zones', None) or []) or 'none'} (if any, mention the zone in the rationale); "
            f"citizen_note={(report.note if report else '')!r}")


def build_akamai_agent(system_prompt: str, max_tokens: int = 400) -> Any:
    """Fresh Strands Agent on Akamai hosted chat. Built per request, never shared. No structured_output_model."""
    from strands import Agent
    from strands.models.openai import OpenAIModel

    class AkamaiChatModel(OpenAIModel):
        """Akamai's gateway rejects `tools: []`, which Strands sends for tool-less agents. Drop it."""

        def format_request(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
            request = super().format_request(*args, **kwargs)
            if not request.get("tools"):
                request.pop("tools", None)
                request.pop("tool_choice", None)
            return request

    model = AkamaiChatModel(
        client_args={"api_key": akamai_key(),
                     "base_url": os.getenv("AKAMAI_AI_BASE_URL") or "https://ws.akamai-workshops.com/v1"},
        model_id=chat_model_name(),
        params={"max_tokens": max_tokens},
    )
    return Agent(model=model, system_prompt=system_prompt, callback_handler=None)
