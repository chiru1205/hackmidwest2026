"""Points, levels, badges."""
from __future__ import annotations

POINTS = {"first": 50, "confirm": 5, "photo_confirm": 15, "fixed_first": 100, "fixed_other": 20}
LEVELS = [("Resident", 0), ("Watcher", 250), ("Guardian", 1000), ("Champion", 3000), ("Civic Hero", 10000)]

BADGES = [
    {"id": "first_report", "name": "First Report", "description": "File your first report"},
    {"id": "good_neighbor", "name": "Good Neighbor", "description": "Confirm 5 issues"},
    {"id": "fixer", "name": "Fixer", "description": "Have a report you filed get fixed"},
    {"id": "streak_3", "name": "On a Roll", "description": "Report 3 weeks in a row"},
    {"id": "watcher", "name": "Watcher", "description": "Reach 250 XP"},
    {"id": "guardian", "name": "Guardian", "description": "Reach 1000 XP"},
]


def points_for(kind: str) -> int:
    return POINTS.get(kind, 0)


def level_for(xp: int) -> tuple[str, int]:
    """(level name, xp needed for the next level; the top level returns its own threshold)."""
    name, nxt = LEVELS[0][0], LEVELS[1][1]
    for i, (n, t) in enumerate(LEVELS):
        if xp >= t:
            name = n
            nxt = LEVELS[i + 1][1] if i + 1 < len(LEVELS) else t
    return name, nxt


def earned_badges(stats: dict) -> list[str]:
    """stats keys: reports, confirmations, fixed, streak_weeks, xp (missing = 0)."""
    def g(k):
        return stats.get(k, 0) or 0
    out = []
    if g("reports") >= 1:
        out.append("first_report")
    if g("confirmations") >= 5:
        out.append("good_neighbor")
    if g("fixed") >= 1:
        out.append("fixer")
    if g("streak_weeks") >= 3:
        out.append("streak_3")
    if g("xp") >= 250:
        out.append("watcher")
    if g("xp") >= 1000:
        out.append("guardian")
    return out
