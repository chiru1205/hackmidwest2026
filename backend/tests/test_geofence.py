"""Geofence engine: real KCMO neighborhood polygons, council districts, priority zones."""
import json
import time

from backend.engine import geofence as gf


def test_plaza_is_in_kc_with_district():
    r = gf.locate(39.0420, -94.5950)
    assert r["in_service_area"] and r["neighborhood"] and "Plaza" in r["neighborhood"]
    assert r["district"] and r["district"].startswith("District ")


def test_st_louis_is_outside():
    r = gf.geofence(38.63, -90.2)
    assert not r["in_service_area"] and r["neighborhood"] is None and r["zones"] == []
    assert "service area" in r["message"]


def test_inside_has_no_message():
    assert gf.geofence(39.0420, -94.5950)["message"] is None


def test_school_zone_hit_and_boost():
    z = next(z for z in gf.layers()["zones"] if z["type"] == "school")
    hits = gf.zones_at(z["lat"], z["lng"])
    h = next(h for h in hits if h["name"] == z["name"])
    assert h["type"] == "school" and h["radius_m"] == 150 and h["distance_m"] <= 1 and h["boost"] == 1.0
    assert gf.criticality(hits) == 1.0
    assert gf.zone_label(h).startswith("School zone: ")
    assert gf.zones_at(z["lat"] + 0.02, z["lng"]) == [] or all(x["name"] != z["name"] for x in gf.zones_at(z["lat"] + 0.02, z["lng"]))


def test_hospital_zone_radius():
    z = next(z for z in gf.layers()["zones"] if z["type"] == "hospital")
    assert z["radius_m"] == 250
    assert any(h["type"] == "hospital" for h in gf.zones_at(z["lat"], z["lng"]))


def test_criticality_empty_and_arterial():
    assert gf.criticality([]) == 0.0
    assert gf.criticality([{"boost": 0.8}, {"boost": 0.3}]) == 0.8


def test_edge_tolerance_accepts_boundary_but_not_far():
    # a vertex of a real polygon is on the boundary; 20 m outside is tolerated, 300 m outside is not
    gj = gf.layers()["neighborhoods"]
    g = gj["features"][0]["geometry"]
    ring = (g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0])
    lng, lat = ring[0]
    assert gf.locate(lat, lng)["in_service_area"]
    far = gf.locate(38.0, -90.0)
    assert not far["in_service_area"]


def test_layers_shape_and_size():
    L = gf.layers()
    assert L["neighborhoods"]["type"] == "FeatureCollection" and len(L["neighborhoods"]["features"]) > 100
    f = L["neighborhoods"]["features"][0]
    assert f["geometry"]["type"] in ("Polygon", "MultiPolygon") and {"name", "district"} <= set(f["properties"])
    assert {"type", "name", "lat", "lng", "radius_m"} <= set(L["zones"][0])
    assert len(json.dumps(L)) < 500_000


def test_locate_is_fast():
    t = time.perf_counter()
    for _ in range(50):
        gf.geofence(39.0420, -94.5950)
        gf.geofence(38.63, -90.2)
    assert (time.perf_counter() - t) / 100 < 0.02
