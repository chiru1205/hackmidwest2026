"""Priority score, buckets, ticket severity, milestones."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from contracts.models import Cluster

SLA_DAYS = {"pothole": 7, "streetlight_out": 10, "flooding": 1}
HAZARD_SLA = 2
DEFAULT_SLA = 14
MILESTONES = (1, 5, 10, 25, 50, 100, 250, 500, 1000)
_SEV = {"P1": "blocker", "P2": "high", "P3": "medium", "P4": "low"}


def sla_days(cluster: Cluster) -> float:
    if cluster.is_hazard:
        return HAZARD_SLA
    return SLA_DAYS.get(cluster.category, DEFAULT_SLA)


def bucket_for(p: float) -> str:
    if p >= 80:
        return "P1"
    if p >= 60:
        return "P2"
    if p >= 35:
        return "P3"
    return "P4"


def compute_priority(cluster: Cluster, now: datetime | None = None) -> tuple[float, str]:
    now = now or datetime.now(timezone.utc)
    try:
        t0 = datetime.fromisoformat(cluster.first_reported_at.replace("Z", "+00:00"))
        if t0.tzinfo is None:
            t0 = t0.replace(tzinfo=timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now - t0).total_seconds() / 86400)
    except (ValueError, AttributeError):
        age_days = 0.0
    S = (cluster.severity - 1) / 4
    R = min(1.0, math.log10(1 + cluster.reporter_count) / math.log10(1001))
    H = 1.0 if cluster.is_hazard else 0.0
    L = cluster.location_crit
    A = min(1.0, age_days / sla_days(cluster))
    W = 0.0
    p = 100 * min(1.0, 0.30 * S + 0.25 * R + 0.15 * H + 0.15 * L + 0.10 * A + 0.05 * W)
    p = round(p, 1)
    return p, bucket_for(p)


def ticket_severity(bucket: str) -> str:
    return _SEV.get(bucket, "low")


def is_milestone(reporter_count: int) -> bool:
    return reporter_count in MILESTONES
