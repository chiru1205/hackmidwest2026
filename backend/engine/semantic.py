"""Semantic dedup helpers (pure Python, no network): cosine, thresholds, text builders, decision."""
from __future__ import annotations

import math
from typing import Sequence

MERGE_AT = 0.72      # cosine >= this: same issue
NEW_AT = 0.60        # cosine <= this: different issue
MIN_TEXT = 8         # a note / hazard description shorter than this carries no signal
CLUSTER_TEXT_MAX = 700


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def decide(sim: float, merge_at: float = MERGE_AT, new_at: float = NEW_AT) -> str:
    """'merge' | 'new' | 'unsure' (fall back to the LLM / rule judge)."""
    if sim >= merge_at:
        return "merge"
    if sim <= new_at:
        return "new"
    return "unsure"


def has_signal(note: str, hazard_desc: str = "") -> bool:
    return len((note or "").strip()) >= MIN_TEXT or len((hazard_desc or "").strip()) >= MIN_TEXT


def report_text(label: str, note: str, hazard_desc: str = "") -> str:
    parts = [label, (note or "").strip(), (hazard_desc or "").strip()]
    return ". ".join(p for p in parts if p)[:CLUSTER_TEXT_MAX]


def cluster_text(label: str, hazard_desc: str, rationale: str, notes: Sequence[str]) -> str:
    """Hazard description + notes first (the signal), a short rationale last, truncated."""
    seen: list[str] = []
    for n in notes:
        n = (n or "").strip()
        if n and n not in seen:
            seen.append(n[:200])
    parts = [label, (hazard_desc or "").strip(), *seen[:5], (rationale or "").strip()[:120]]
    return ". ".join(p for p in parts if p)[:CLUSTER_TEXT_MAX]


def best_match(new_vec: Sequence[float], cand_vecs: dict[str, Sequence[float]]) -> tuple[str | None, float]:
    """(cluster_id, cosine) of the most similar candidate; (None, 0.0) when there are none."""
    best_id, best = None, 0.0
    for cid, v in cand_vecs.items():
        s = cosine(new_vec, v)
        if best_id is None or s > best:
            best_id, best = cid, s
    return best_id, best


def summary(sim: float, verdict: str) -> str:
    word = {"merge": "same issue", "new": "different issue", "unsure": "unclear, asking the judge"}[verdict]
    return f"note similarity {sim:.2f} vs nearest report: {word}"
