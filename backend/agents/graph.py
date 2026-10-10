"""Strands GraphBuilder pipeline (AGENTS_MODE=graph). Raises on any problem; the caller falls back to det.

Graph: priority (writes the rationale) -> ticket_writer (writes title + body). The edge condition is read-only
(the writer runs only if the priority node completed). Dispatch (create ticket, assign vendor) is plain Python.
Also: a single-agent judge for the 0.5-0.75 dedup band.
"""
from __future__ import annotations

import asyncio
import time

from backend.integrations.ai import parse_json_loose, usage
from contracts.models import Cluster, Report

from .common import (LLM_TIMEOUT_S, build_akamai_agent, chat_model_name, cluster_facts, template_body,
                     template_rationale, template_title)

PRIORITY_PROMPT = ("You are a city 311 triage analyst. Given facts about an infrastructure issue, explain in ONE or "
                   "TWO plain sentences why it has its priority. Reply with strict JSON only: "
                   '{"rationale": "<text>"}')
WRITER_PROMPT = ("You write work-order tickets for city crews. Reply with strict JSON only: "
                 '{"title": "<max 80 chars, like \'Pothole near <place> - N reports\'>", '
                 '"body": "<4-6 short lines: category, severity, hazard, reporters, location, map link>"}. '
                 "Use only the facts given. Include the map link https://www.openstreetmap.org/?mlat=LAT&mlon=LNG.")
JUDGE_PROMPT = ("You decide whether a new citizen report describes the SAME physical issue as an existing "
                "cluster. Reply with strict JSON only: "
                '{"decision": "merge" or "new", "cluster_id": "<id or null>", "confidence": 0.0-1.0, "reason": "<one sentence>"}')


def _record_nodes(graph_result, node_ids) -> None:
    """One usage record per Akamai chat node that actually ran."""
    for nid in node_ids:
        try:
            nr = graph_result.results.get(nid)
            if nr is None:
                continue
            u = getattr(nr, "accumulated_usage", None) or {}
            usage.record("chat", True, float(getattr(nr, "execution_time", 0) or 0), int(u.get("totalTokens") or 0) or None)
        except Exception:
            pass


def _node_text(graph_result, node_id: str) -> str:
    nr = graph_result.results[node_id]
    return str(nr.result)


def build_graph(cluster_facts_text: str):
    from strands.multiagent import GraphBuilder

    gb = GraphBuilder()
    gb.add_node(build_akamai_agent(PRIORITY_PROMPT, 300), "priority")
    gb.add_node(build_akamai_agent(WRITER_PROMPT, 400), "ticket_writer")
    gb.add_edge("priority", "ticket_writer", condition=lambda state: "priority" in state.results)
    gb.set_entry_point("priority")
    gb.set_execution_timeout(LLM_TIMEOUT_S * 2)
    return gb.build()


async def run_pipeline_graph(cluster: Cluster, report: Report) -> dict:
    """Returns {"rationale","title","body","model"}. Raises if the graph or its JSON output is unusable."""
    facts = cluster_facts(cluster, report)
    graph = build_graph(facts)
    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(graph.invoke_async(f"Facts: {facts}\nMap lat={cluster.lat} lng={cluster.lng}"),
                                        timeout=LLM_TIMEOUT_S * 2)
    except Exception:
        usage.record("chat", False, (time.perf_counter() - t0) * 1000)
        raise
    _record_nodes(result, ("priority", "ticket_writer"))
    pri = parse_json_loose(_node_text(result, "priority")) or {}
    wr = parse_json_loose(_node_text(result, "ticket_writer")) or {}
    rationale = str(pri.get("rationale") or "").strip()
    title = str(wr.get("title") or "").strip()
    body = str(wr.get("body") or "").strip()
    if not (rationale or title or body):
        raise ValueError("graph produced no usable JSON")
    return {"rationale": rationale or template_rationale(cluster),
            "title": title[:120] or template_title(cluster),
            "body": body or template_body(cluster, report),
            "model": f"akamai:{chat_model_name()}"}


async def run_judge_agent(report: Report, candidates: list[Cluster], scores: dict[str, float]) -> dict:
    """Single Strands agent (fresh per call). Raises on failure; the caller validates and falls back."""
    agent = build_akamai_agent(JUDGE_PROMPT, 300)
    lines = [f"- id={c.id} category={c.category} reporters={c.reporter_count} address={c.address} "
             f"score={scores.get(c.id, 0):.2f}" for c in candidates]
    prompt = (f"New report: category={report.category} note={report.note!r} at {report.lat},{report.lng}\n"
              "Candidate clusters:\n" + "\n".join(lines))
    t0 = time.perf_counter()
    try:
        res = await asyncio.wait_for(agent.invoke_async(prompt), timeout=LLM_TIMEOUT_S)
    except Exception:
        usage.record("chat", False, (time.perf_counter() - t0) * 1000)
        raise
    tokens = None
    try:
        tokens = int(res.metrics.accumulated_usage.get("totalTokens") or 0) or None
    except Exception:
        pass
    usage.record("chat", True, (time.perf_counter() - t0) * 1000, tokens)
    out = parse_json_loose(str(res))
    if not out:
        raise ValueError("judge returned no JSON")
    return out
