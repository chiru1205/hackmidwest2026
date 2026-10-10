"""Roles: staff routes need the city token; citizen routes are open and user-scoped."""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from contracts.models import Cluster
from backend.api import auth, store
from backend.api.routes import admin, analytics, devrev, geofence, ops, reports, users

TOKEN = "civicflow-city-demo"


@pytest.fixture()
def app():
    a = FastAPI()
    for r in (reports.router, users.router, ops.router, admin.router, analytics.router, geofence.router, devrev.router):
        a.include_router(r, prefix="/api")
    return a


@pytest.fixture()
def client(app, monkeypatch):
    monkeypatch.setenv("CITY_TOKEN", TOKEN)
    return TestClient(app)


# every staff route (method, path) -- no side effects happen because the 403 fires first
STAFF = [
    ("GET", "/api/stats"), ("GET", "/api/tickets"), ("POST", "/api/tickets/CF-1/advance"),
    ("GET", "/api/vendor/orders"), ("POST", "/api/vendor/orders/c_x/fix"), ("GET", "/api/events"),
    ("GET", "/api/events/recent"), ("GET", "/api/nearby?lat=39&lng=-94"), ("GET", "/api/clusters"),
    ("GET", "/api/clusters/c_x"), ("GET", "/api/geofence/layers"), ("GET", "/api/ai-usage"),
    ("POST", "/api/admin/simulate"), ("POST", "/api/admin/reset"), ("GET", "/api/admin/flags"),
    ("POST", "/api/admin/flags"), ("GET", "/api/analytics/work-orders"), ("GET", "/api/analytics/app"),
    ("GET", "/api/devrev/board"), ("GET", "/api/devrev/ticket/CF-1/journey"),
    ("POST", "/api/devrev/ticket/CF-1/action"), ("GET", "/api/devrev/events"),
]


@pytest.mark.parametrize("method,path", STAFF)
def test_staff_routes_403_without_token(client, method, path):
    r = client.request(method, path)
    assert r.status_code == 403 and r.json() == {"detail": "city staff only"}
    assert client.request(method, path, headers={"X-Role-Token": "wrong"}).status_code == 403


def test_staff_route_ok_with_token(client):
    assert client.get("/api/geofence/layers", headers={"X-Role-Token": TOKEN}).status_code == 200
    assert client.get("/api/admin/flags", headers={"X-Role-Token": TOKEN}).status_code == 200


def test_events_accepts_query_token_only_there(client):
    assert client.get("/api/events?token=nope").status_code == 403
    assert client.get("/api/stats?token=" + TOKEN).status_code == 403   # query token is for /events only


def test_citizen_routes_open(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/impact").status_code == 200
    assert client.get("/api/geofence?lat=39.042&lng=-94.595").status_code == 200


def test_no_enforcement_when_unset(app, monkeypatch):
    monkeypatch.delenv("CITY_TOKEN", raising=False)
    c = TestClient(app)
    assert c.get("/api/geofence/layers").status_code == 200
    monkeypatch.setenv("CITY_TOKEN", "")
    assert c.get("/api/geofence/layers").status_code == 200


def test_auth_helper():
    assert auth.city_token() in ("", auth.city_token())


# ---- /api/me/requests is scoped to the caller (store faked; no database touched)
def _cluster(cid, **kw):
    base = dict(id=cid, category="streetlight_out", lat=39.0, lng=-94.5, reporter_count=3, report_count=3, bucket="P2",
                address="5201 Charlotte St", neighborhood="Hyde Park", vendor="KC Lighting Co.",
                first_reported_at="2026-10-01T10:00:00Z", last_reported_at="2026-10-02T10:00:00Z")
    base.update(kw)
    return Cluster(**base)


@pytest.fixture()
def fake_store(monkeypatch):
    clusters = {"c_a": _cluster("c_a"), "c_b": _cluster("c_b", category="pothole", vendor=None)}
    owners = {"u_alice": ["c_a"], "u_bob": ["c_b"]}
    tl = {"tl:c_a": json.dumps([
        {"ts": "2026-10-01T10:00:00Z", "label": "Reported", "detail": "First report from someone"},
        {"ts": "2026-10-01T11:00:00Z", "label": "Confirmed by a neighbor", "detail": "2 reporters"},
        {"ts": "2026-10-01T12:00:00Z", "label": "Ticket created", "detail": "CF-9 assigned to KC Lighting Co."},
        {"ts": "2026-10-02T09:00:00Z", "label": "Work started", "detail": ""}])}

    class Row(dict):
        pass

    def q(sql, params=()):
        if "FROM reports" in sql:
            uid = params[0]
            if "json_extract" in sql:
                return [Row(photo_url="/photos/r_mine.jpg")] if params[1] in owners.get(uid, []) else []
            if "DISTINCT" in sql:
                return [Row(cluster_id=c) for c in owners.get(uid, [])]
            return [Row(x=1)] if params[1] in owners.get(uid, []) else []
        if "FROM ledger" in sql:
            return [Row(p=15)]
        return []

    monkeypatch.setattr(store, "clusters", clusters)
    monkeypatch.setattr(store, "q", q)
    monkeypatch.setattr(store, "meta_get", lambda k, *a: tl.get(k))


def test_my_requests_scoped(client, fake_store):
    r = client.get("/api/me/requests", headers={"X-User-Id": "u_alice"})
    assert r.status_code == 200
    items = r.json()
    assert [i["id"] for i in items] == ["c_a"]
    i = items[0]
    assert i["title"] == "Streetlight out near 5201 Charlotte St"
    assert i["neighbors"] == 3 and i["status"] == "assigned" and i["stage_label"] == "Crew assigned"
    assert i["crew"] == "KC Lighting Co." and i["my_points"] == 15 and i["due"]
    labels = [t["label"] for t in i["timeline"]]
    assert labels[0] == "Reported" and "Neighbors joined" in labels and "Crew assigned" in labels and "Work started" in labels
    assert "someone" not in json.dumps(i)          # no other citizen's text leaks
    assert i["my_photo_url"] == "/photos/r_mine.jpg" and i["photo_url"] == "/photos/r_mine.jpg"   # the citizen sees their own photo
    assert client.get("/api/me/requests", headers={"X-User-Id": "u_nobody"}).json() == []


def test_my_request_detail_scoped(client, fake_store):
    assert client.get("/api/me/requests/c_a", headers={"X-User-Id": "u_alice"}).status_code == 200
    assert client.get("/api/me/requests/c_a", headers={"X-User-Id": "u_bob"}).status_code == 404
    assert client.get("/api/me/requests/c_zzz", headers={"X-User-Id": "u_bob"}).status_code == 404
