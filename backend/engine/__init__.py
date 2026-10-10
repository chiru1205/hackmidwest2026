"""Civic Flow engine: pure-Python dedup, priority, gamification, anti-fraud, edge cache."""
from .dedup import category_score, decide, radii, score_candidate
from .edgekv import EdgeKV, cell_key
from .fraud import RateLimiter, compute_phash, is_duplicate_photo, phash_distance
from .geo import GeoIndex, geohash, haversine_m, neighbors
from .priority import bucket_for, compute_priority, is_milestone, ticket_severity
from . import semantic
from .xp import BADGES, POINTS, earned_badges, level_for, points_for

__all__ = [
    "semantic",
    "decide", "radii", "score_candidate", "category_score", "EdgeKV", "cell_key",
    "RateLimiter", "compute_phash", "is_duplicate_photo", "phash_distance",
    "GeoIndex", "geohash", "haversine_m", "neighbors", "bucket_for", "compute_priority",
    "is_milestone", "ticket_severity", "BADGES", "POINTS", "earned_badges", "level_for", "points_for",
]
