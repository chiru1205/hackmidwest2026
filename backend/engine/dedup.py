"""Dedup scoring and decision. Constants per contracts/API.md."""
from __future__ import annotations

from datetime import datetime, timezone

from contracts.models import Cluster
from .geo import haversine_m

RADII: dict[str, tuple[float, float]] = {
    "pothole": (15, 40), "streetlight_out": (20, 50), "traffic_signal": (60, 60),
    "sidewalk_damage": (20, 40), "manhole_cover": (10, 25), "road_debris": (20, 50),
    "graffiti": (25, 50), "illegal_dumping": (50, 100), "downed_tree": (75, 120),
    "flooding": (300, 400), "other": (25, 50),
}
RELATED = {frozenset(("pothole", "manhole_cover")), frozenset(("streetlight_out", "traffic_signal"))}
MERGE_SCORE = 0.75
JUDGE_SCORE = 0.50
REOPEN_DAYS = 30


def radii(category: str) -> tuple[float, float]:
    return RADII.get(category, RADII["other"])


def category_score(a: str, b: str) -> float:
    if a == b:
        return 1.0
    return 0.5 if frozenset((a, b)) in RELATED else 0.0


def _parse(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None
    except ValueError:
        return None


def score_candidate(report_lat: float, report_lng: float, report_category: str,
                    cluster: Cluster, now: datetime | None = None) -> tuple[float, float]:
    """Return (score, distance_m). Unrelated categories never merge (score 0).

    Fixed clusters fixed more than 30 days ago are not candidates (score 0).
    """
    d = haversine_m(report_lat, report_lng, cluster.lat, cluster.lng)
    cat = category_score(report_category, cluster.category)
    if cat == 0.0:
        return 0.0, d
    if cluster.status == "fixed":
        fixed = _parse(cluster.fixed_at)
        now = now or datetime.now(timezone.utc)
        if fixed is not None:
            if fixed.tzinfo is None:
                fixed = fixed.replace(tzinfo=timezone.utc)
            if (now - fixed).days > REOPEN_DAYS:
                return 0.0, d
    r_max = radii(cluster.category)[1]
    geo = max(0.0, 1 - d / r_max)
    time = 1.0
    score = (0.50 * geo + 0.20 * cat + 0.15 * time) / 0.85
    return score, d


def decide(candidates: list[tuple[Cluster, float, float]], report_category: str | None = None) -> dict:
    """candidates: (cluster, score, distance_m).

    report_category (optional) enables the same-category auto-merge radius rule;
    when omitted the rule is applied to every candidate.
    """
    scores = {c.id: s for c, s, _ in candidates}
    if not candidates:
        return {"action": "create", "cluster": None, "score": 0.0, "distance_m": 0.0, "scores": scores}

    def auto(c: Cluster, d: float) -> bool:
        same = report_category is None or report_category == c.category
        return same and d <= radii(c.category)[0]

    c, s, d = max(candidates, key=lambda t: (auto(t[0], t[2]) or t[1] >= MERGE_SCORE, t[1]))
    if s >= MERGE_SCORE or auto(c, d):
        action = "merge"
    elif s >= JUDGE_SCORE:
        action = "judge"
    else:
        action = "create"
    return {"action": action, "cluster": c if action != "create" else None,
            "score": s, "distance_m": d, "scores": scores}
