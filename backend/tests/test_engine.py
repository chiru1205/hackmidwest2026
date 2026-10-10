import time
from datetime import datetime, timezone

import pytest

from backend.engine import (EdgeKV, GeoIndex, RateLimiter, bucket_for, cell_key, compute_priority,
                            decide, earned_badges, geohash, haversine_m, is_duplicate_photo,
                            is_milestone, level_for, neighbors, phash_distance, points_for,
                            radii, score_candidate, ticket_severity)
from contracts.models import Cluster

NOW = datetime(2026, 10, 10, tzinfo=timezone.utc)
TS = NOW.isoformat()
LAT, LNG = 39.0420, -94.5950
M_PER_DEG = 111194.9


def mk(cat="pothole", dlat_m=0.0, **kw):
    d = dict(id="c1", category=cat, lat=LAT + dlat_m / M_PER_DEG, lng=LNG,
             first_reported_at=TS, last_reported_at=TS)
    d.update(kw)
    return Cluster(**d)


@pytest.mark.parametrize("d,exp,action", [(10, 0.853, "merge"), (30, 0.559, "judge"), (35, 0.485, "create")])
def test_dedup_worked(d, exp, action):
    c = mk(dlat_m=d)
    s, dist = score_candidate(LAT, LNG, "pothole", c)
    assert s == pytest.approx(exp, abs=0.002)
    assert dist == pytest.approx(d, abs=0.5)
    assert decide([(c, s, dist)], "pothole")["action"] == action


def test_auto_radius_merge():
    c = mk(dlat_m=14)
    s, d = score_candidate(LAT, LNG, "pothole", c)
    assert decide([(c, s, d)], "pothole")["action"] == "merge"


def test_different_category_never_merges():
    c = mk()
    s, _ = score_candidate(LAT, LNG, "graffiti", c)
    assert s == 0.0
    assert decide([(c, s, 0.0)], "graffiti")["action"] == "create"


def test_related_category():
    s, _ = score_candidate(LAT, LNG, "manhole_cover", mk())
    assert s == pytest.approx((0.5 + 0.1 + 0.15) / 0.85)
    s2, _ = score_candidate(LAT, LNG, "traffic_signal", mk("streetlight_out"))
    assert s2 > 0


def test_decide_empty_and_radii():
    assert decide([])["action"] == "create"
    assert radii("flooding") == (300, 400)
    assert radii("nope") == (25, 50)


def test_priority_worked():
    p, b = compute_priority(mk(severity=3, location_crit=0.2, reporter_count=1), NOW)
    assert p == pytest.approx(20.5, abs=0.1) and b == "P4"
    p, _ = compute_priority(mk(severity=3, location_crit=0.2, reporter_count=1000), NOW)
    assert p == pytest.approx(43, abs=0.5)
    p, b = compute_priority(mk(severity=5, is_hazard=True, location_crit=1.0, reporter_count=1), NOW)
    assert p == pytest.approx(62.5, abs=0.1) and b == "P2"


def test_priority_age():
    base = mk(severity=3, location_crit=0.2, reporter_count=1,
              first_reported_at="2026-10-03T00:00:00+00:00")  # 7 days = pothole SLA
    p, _ = compute_priority(base, NOW)
    assert p == pytest.approx(30.5, abs=0.1)


def test_buckets_severity_milestones():
    assert [bucket_for(x) for x in (80, 79.9, 60, 35, 34.9)] == ["P1", "P2", "P2", "P3", "P4"]
    assert [ticket_severity(b) for b in ("P1", "P2", "P3", "P4")] == ["blocker", "high", "medium", "low"]
    assert all(is_milestone(n) for n in (1, 5, 10, 25, 50, 100, 250, 500, 1000))
    assert not is_milestone(2) and not is_milestone(999)


def test_levels_points_badges():
    assert level_for(0) == ("Resident", 250)
    assert level_for(250) == ("Watcher", 1000)
    assert level_for(3000) == ("Champion", 10000)
    assert level_for(10000)[0] == "Civic Hero"
    assert points_for("first") == 50 and points_for("confirm") == 5 and points_for("photo_confirm") == 15
    assert "first_report" in earned_badges({"reports": 1})
    assert earned_badges({}) == []


def test_haversine_and_geohash():
    assert haversine_m(0, 0, 1, 0) == pytest.approx(111_195, rel=0.005)
    assert haversine_m(LAT, LNG, LAT, LNG) == 0
    assert geohash(57.64911, 10.40744, 11) == "u4pruydqqvj"
    cell = geohash(LAT, LNG, 7)
    assert len(cell) == 7 and cell == cell_key(LAT, LNG)
    n = neighbors(cell)
    assert len(n) == 8 and cell not in n


def test_geo_index():
    g = GeoIndex()
    g.add("near", LAT + 10 / M_PER_DEG, LNG, "pothole")
    g.add("mid", LAT + 30 / M_PER_DEG, LNG, "graffiti")
    g.add("far", LAT + 1, LNG, "pothole")
    assert g.query(LAT, LNG, 20) == ["near"]
    assert g.query(LAT, LNG, 50) == ["near", "mid"]
    assert g.query(LAT, LNG, 50, "graffiti") == ["mid"]
    g.remove("near")
    assert g.query(LAT, LNG, 20) == []


def test_phash():
    assert phash_distance("ffff", "ffff") == 0
    assert phash_distance("0000", "000f") == 4
    assert is_duplicate_photo("0000", "003f")      # 6 bits
    assert not is_duplicate_photo("0000", "007f")  # 7 bits
    assert not is_duplicate_photo(None, "00")


def test_rate_limiter():
    r = RateLimiter(3, 10)
    assert all(r.hit("u", t) for t in (0, 1, 2))
    assert not r.hit("u", 3)
    assert r.hit("other", 3)
    assert r.hit("u", 10.5)


def test_edgekv():
    kv = EdgeKV()
    assert kv.get("a", "b", "c") is None
    kv.put("a", "b", "c", {"x": 1})
    assert kv.get("a", "b", "c") == {"x": 1}
    kv.delete("a", "b", "c")
    assert kv.get("a", "b", "c") is None
    kv.put("a", "b", "t", 1, ttl_s=0.05)
    assert kv.get("a", "b", "t") == 1
    time.sleep(0.08)
    assert kv.get("a", "b", "t") is None


def test_edgekv_cells_and_bad_valkey():
    kv = EdgeKV(url="redis://127.0.0.1:1/0")  # unreachable -> memory fallback
    assert kv.backend == "memory"
    v, hit, ms = kv.get_cell("abc")
    assert v is None and not hit
    kv.put_cell("abc", [{"id": "c1"}])
    v, hit, ms = kv.get_cell("abc")
    assert hit and v == [{"id": "c1"}] and ms >= 0
    s = kv.stats()
    assert s["hits"] == 1 and s["misses"] == 1
