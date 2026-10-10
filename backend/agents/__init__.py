"""Agents layer. Public async API (see contracts/API.md): analyze_photo, judge_dedup, run_new_cluster_pipeline."""
from __future__ import annotations

import logging
import time

from contracts.models import Cluster, Report, Triage

from . import det
from .common import (Emit, chat_model_name, elapsed_ms, graph_enabled, step, template_body,
                     template_rationale, template_title)

log = logging.getLogger("civicflow.agents")
__all__ = ["analyze_photo", "judge_dedup", "run_new_cluster_pipeline", "Emit"]


async def analyze_photo(image: bytes, note: str, category_hint: str | None, emit: Emit) -> Triage | None:
    from . import vision
    if not vision.vision_on():
        return None
    t0 = time.perf_counter()
    step(emit, "intake", "start", model="vision")
    triage, provider = await vision.triage_photo(image, note, category_hint)
    if triage is None:
        step(emit, "intake", "error", ms=elapsed_ms(t0), summary="vision unavailable, using category chips + note")
        return None
    step(emit, "intake", "done", ms=elapsed_ms(t0),
         summary=f"{triage.category}, severity {triage.severity}, hazard={triage.is_safety_hazard}", model=provider)
    return triage


async def judge_dedup(new_report: Report, candidates: list[Cluster], scores: dict[str, float], emit: Emit) -> dict:
    rid = new_report.id
    if not candidates:
        return det.det_judge(candidates, scores, rid, emit)
    if graph_enabled():
        from . import graph
        t0 = time.perf_counter()
        step(emit, "judge", "start", rid, model=f"akamai:{chat_model_name()}")
        try:
            out = await graph.run_judge_agent(new_report, candidates, scores)
            decision = str(out.get("decision", "")).lower()
            cid = out.get("cluster_id")
            valid_ids = {c.id for c in candidates}
            if decision == "merge" and cid in valid_ids:
                res = {"decision": "merge", "cluster_id": cid}
            elif decision == "new":
                res = {"decision": "new", "cluster_id": None}
            else:
                raise ValueError("invalid judge output")
            try:
                conf = max(0.0, min(1.0, float(out.get("confidence", 0.7))))
            except (TypeError, ValueError):
                conf = 0.7
            res.update({"confidence": conf, "reason": str(out.get("reason") or "")[:300]})
            step(emit, "judge", "done", rid, res["cluster_id"] or "", elapsed_ms(t0), res["reason"],
                 f"akamai:{chat_model_name()}")
            return res
        except Exception as e:
            log.warning("graph judge failed (%s), using rule judge", type(e).__name__)
            step(emit, "judge", "error", rid, ms=elapsed_ms(t0), summary=f"LLM judge failed ({type(e).__name__}), rule fallback")
    return det.det_judge(candidates, scores, rid, emit)


async def run_new_cluster_pipeline(cluster: Cluster, report: Report, emit: Emit) -> dict:
    from backend.integrations import devrev

    rid, cid = report.id, cluster.id
    # --- priority (rationale) + ticket text ---
    t0 = time.perf_counter()
    texts = None
    model = "template"
    if graph_enabled():
        step(emit, "priority", "start", rid, cid, model=f"akamai:{chat_model_name()}")
        try:
            from . import graph
            texts = await graph.run_pipeline_graph(cluster, report)
            model = texts["model"]
        except Exception as e:
            log.warning("graph pipeline failed (%s), using det", type(e).__name__)
            step(emit, "priority", "error", rid, cid, elapsed_ms(t0), f"graph failed ({type(e).__name__}), template fallback")
    else:
        step(emit, "priority", "start", rid, cid, model="template")
    if texts is None:
        texts = det.det_texts(cluster, report)
    step(emit, "priority", "done", rid, cid, elapsed_ms(t0), texts["rationale"], model)

    # --- dispatch (plain Python) ---
    t1 = time.perf_counter()
    step(emit, "dispatch", "start", rid, cid)
    vendor = None
    ticket = None
    try:
        vendor = devrev.pick_vendor(cluster.category)
        ticket = devrev.create_ticket(cluster, texts["title"] or template_title(cluster),
                                      texts["body"] or template_body(cluster, report), vendor)
        step(emit, "dispatch", "done", rid, cid, elapsed_ms(t1), f"{ticket.id} -> {vendor}")
    except Exception as e:
        log.exception("dispatch failed")
        step(emit, "dispatch", "error", rid, cid, elapsed_ms(t1), f"ticket creation failed: {type(e).__name__}")
        pass
    return {"rationale": texts["rationale"], "ticket": ticket, "vendor": vendor}
