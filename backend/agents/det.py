"""Deterministic (pure Python, no network) agents. Same emitted events as the graph mode."""
from __future__ import annotations

import time

from contracts.models import Cluster, Report

from .common import (Emit, elapsed_ms, step, template_body, template_rationale, template_title)


def rule_judge(candidates: list[Cluster], scores: dict[str, float]) -> dict:
    """Merge into the best-scoring candidate if its score >= 0.6, else new cluster."""
    best = max(candidates, key=lambda c: scores.get(c.id, 0.0), default=None)
    if best is not None and scores.get(best.id, 0.0) >= 0.6:
        s = scores[best.id]
        return {"decision": "merge", "cluster_id": best.id, "confidence": round(min(1.0, s), 2),
                "reason": f"Rule judge: score {s:.2f} >= 0.60, treating as the same issue."}
    s = scores.get(best.id, 0.0) if best else 0.0
    return {"decision": "new", "cluster_id": None, "confidence": round(1 - s, 2),
            "reason": f"Rule judge: best score {s:.2f} < 0.60, treating as a new issue."}


def det_judge(candidates: list[Cluster], scores: dict[str, float], report_id: str, emit: Emit) -> dict:
    t0 = time.perf_counter()
    step(emit, "judge", "start", report_id, "", model="rule")
    out = rule_judge(candidates, scores)
    step(emit, "judge", "done", report_id, out["cluster_id"] or "", elapsed_ms(t0), out["reason"], "rule")
    return out


def det_texts(cluster: Cluster, report: Report) -> dict:
    return {"rationale": template_rationale(cluster), "title": template_title(cluster),
            "body": template_body(cluster, report), "model": "template"}
