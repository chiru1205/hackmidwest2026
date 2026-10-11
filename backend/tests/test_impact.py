"""Impact page numbers and the platform summary. No network, no models, no database."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.agents import verify, vision
from backend.api import config, pipeline, store
from backend.api.routes import impact
from backend.integrations.ai import usage
from contracts.models import Cluster

TOKEN = "civicflow-city-demo"
H = {"X-Role-Token": TOKEN}
TS = "2026-10-10T12:00:00Z"


def cl(cid, reporters=1, district=None, **kw):
    return Cluster(id=cid, category="pothole", lat=39.0, lng=-94.5, reporter_count=reporters, report_count=reporters,
                   district=district, first_reported_at=TS, last_reported_at=TS, **kw)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("CITY_TOKEN", TOKEN)
    app = FastAPI()
    app.include_router(impact.router, prefix="/api")
    return TestClient(app)


@pytest.fixture()
def seeded(monkeypatch):
    """An in-memory store: a dict stands in for kv_meta, the cluster and counter dicts are swapped out."""
    meta: dict = {}
    clusters = {c.id: c for c in (cl("a", 4, "District 4", ticket_id="CF-1"), cl("b", 3, "District 2", ticket_id="CF-2"),
                                  cl("c", 2, "District 4", ticket_id="CF-3"), cl("d", 2, ticket_id="CF-4"),
                                  cl("e", 1, "District 6"))}
    monkeypatch.setattr(store, "clusters", clusters)
    monkeypatch.setattr(store, "counters", {**store.default_counters(), "total_reports": 20})
    monkeypatch.setattr(store, "meta_get", lambda k: meta.get(k))
    monkeypatch.setattr(store, "meta_set", lambda k, v: meta.__setitem__(k, v))
    monkeypatch.setattr(impact, "_counts", lambda: {"open": 10, "needs_you": 3, "agent_closed": 2})
    monkeypatch.setattr(impact, "_tickets_in_devrev", lambda: 2)       # the mirrored subset, a platform detail only
    return meta


def test_live_numbers(client, seeded):
    store.record_latency(1.0); store.record_latency(3.0); store.record_latency(2.0)
    j = client.get("/api/impact/live", headers=H).json()
    assert j["reports"] == 20 and j["unique_issues"] == 5 and j["duplicates_avoided"] == 15
    # one ticket per unique issue that has one: the same population as the issue count, not only the mirrored subset
    assert j["tickets_in_devrev"] == 4 and j["median_report_to_ticket_s"] == 2.0
    assert len(j["facts"]) >= 5 and {"label", "value", "note", "estimate", "source"} <= set(j["facts"][0])


def test_duplicates_never_negative(client, seeded):
    store.counters["total_reports"] = 2
    assert client.get("/api/impact/live", headers=H).json()["duplicates_avoided"] == 0


def test_no_latency_data_is_null(client, seeded):
    assert client.get("/api/impact/live", headers=H).json()["median_report_to_ticket_s"] is None


def test_districts_ordered_with_unassigned(client, seeded):
    ds = client.get("/api/impact/live", headers=H).json()["districts"]
    # District 4: 3 + 1, District 2: 2, Unassigned: 1, District 6 has no duplicates so it is left out
    assert ds == [{"label": "District 4", "duplicates": 4}, {"label": "District 2", "duplicates": 2},
                  {"label": "Unassigned", "duplicates": 1}]


def test_split_math(client, seeded):
    s = client.get("/api/impact/live", headers=H).json()["split"]
    assert s == {"closed_by_agent": 2, "on_track": 7, "needs_person": 3, "total": 12}


def test_split_without_board(client, seeded, monkeypatch):
    monkeypatch.setattr(impact, "_counts", lambda: {})
    assert client.get("/api/impact/live", headers=H).json()["split"] == \
        {"closed_by_agent": 0, "on_track": 0, "needs_person": 0, "total": 0}


def test_live_payload_has_no_vendor_names(client, seeded):
    j = client.get("/api/impact/live", headers=H).json()      # the field name tickets_in_devrev is the contract; values stay neutral
    txt = str({k: v for k, v in j.items() if k != "tickets_in_devrev"}).lower()
    for word in ("akamai", "aws", "bedrock", "strands", "devrev"):
        assert word not in txt


def test_latency_list_is_rolling(seeded):
    for i in range(250):
        store.record_latency(float(i))
    xs = store.latencies()
    assert len(xs) == 200 and xs[0] == 50.0 and xs[-1] == 249.0


# ---------------------------------------------------------------- platform
@pytest.fixture()
def plat(seeded, monkeypatch, tmp_path):
    from backend.integrations.devrev import events
    monkeypatch.setenv("DB_PATH", str(tmp_path / "plat.db"))        # the autonomy mode is read from the events database
    monkeypatch.setattr(events, "_ready", False)
    usage.reset()
    usage.record("embedding", True, 100)
    usage.record("embedding", False, 300)
    usage.record("vision", True, 800)
    monkeypatch.setattr(config, "flags", config.flags.model_copy(update={"devrev_mode": "live", "agents_mode": "graph"}))
    monkeypatch.delenv("PLATFORM_HOSTING", raising=False)
    monkeypatch.delenv("PLATFORM_REGION", raising=False)
    for k in ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(vision, "_model_cache", None)
    monkeypatch.setattr(verify, "_vision_cache", None)
    yield
    usage.reset()


def test_platform_parts(client, plat):
    store.counters.update(semantic_merges=3, edge_hits=8, edge_misses=2, edge_ms_sum=5.0, edge_n=10)
    j = client.get("/api/platform", headers=H).json()
    parts = {p["name"]: p for p in j["parts"]}
    assert {"Hosted embeddings", "Hosted chat", "Image generation", "Vision", "Agent framework", "Ticketing",
            "Cloud hosting", "Geo cache"} <= set(parts)
    emb = parts["Hosted embeddings"]
    assert (emb["provider"], emb["calls"], emb["errors"], emb["avg_ms"]) == ("Akamai", 2, 1, 200)
    assert parts["Vision"]["provider"] == "Not configured" and parts["Vision"]["calls"] == 1      # no credentials in this test
    assert parts["Hosted chat"]["calls"] == 0
    assert parts["Agent framework"]["provider"] == "Strands" and parts["Agent framework"]["detail"].startswith("Report agents: on.")
    assert parts["Ticketing"]["provider"] == "DevRev" and parts["Ticketing"]["detail"] == "live, 2 tickets mirrored"
    assert parts["Geo cache"]["calls"] == 10
    assert j["semantic_merges"] == 3 and j["agents_mode"] == config.flags.agents_mode
    assert j["devrev_mode"] == config.flags.devrev_mode and j["hosting"] == "Local (not deployed)"


def test_parts_without_counters_say_not_tracked(client, plat):
    parts = {p["name"]: p for p in client.get("/api/platform", headers=H).json()["parts"]}
    for name in ("Agent framework", "Ticketing", "Cloud hosting"):
        assert (parts[name]["calls"], parts[name]["errors"], parts[name]["avg_ms"]) == (-1, -1, -1), name
    assert parts["Hosted chat"]["calls"] == 0 and parts["Geo cache"]["errors"] == 0       # measured zeros stay zeros


def test_hosting_is_claimed_only_when_configured(client, plat, monkeypatch):
    def part():
        j = client.get("/api/platform", headers=H).json()
        return j["hosting"], next(p for p in j["parts"] if p["name"] == "Cloud hosting")
    monkeypatch.setenv("PLATFORM_REGION", "Chicago")             # a region alone does not make this a cloud deployment
    assert part()[0] == "Local (not deployed)" and part()[1]["provider"] == "Local"
    monkeypatch.setenv("PLATFORM_HOSTING", "Akamai Cloud (Linode) us-ord")
    hosting, p = part()
    assert hosting == "Akamai Cloud (Linode) us-ord, Chicago" and p["provider"] == "Akamai Cloud"


def test_vision_provider_follows_the_real_client_or_the_credentials(client, plat, monkeypatch):
    def provider():
        return next(p for p in client.get("/api/platform", headers=H).json()["parts"] if p["name"] == "Vision")["provider"]
    assert provider() == "Not configured"
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    assert provider() == "Anthropic"
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "x")
    assert provider() == "AWS Bedrock"
    monkeypatch.setattr(verify, "_vision_cache", (object(), "anthropic"))      # the client that was really built wins
    assert provider() == "Anthropic"


def test_strands_is_marked_inactive_in_deterministic_mode(client, plat, monkeypatch):
    monkeypatch.setattr(config, "flags", config.flags.model_copy(update={"agents_mode": "det"}))
    parts = {p["name"]: p for p in client.get("/api/platform", headers=H).json()["parts"]}
    assert "inactive" in parts["Agent framework"]["detail"]


def test_semantic_merge_counter(seeded):
    assert store.counters["semantic_merges"] == 0
    pipeline.note_semantic_merge(); pipeline.note_semantic_merge()
    assert store.counters["semantic_merges"] == 2
    assert store.default_counters()["semantic_merges"] == 0        # the admin reset starts it from zero again


# ---------------------------------------------------------------- auth
@pytest.mark.parametrize("path", ["/api/impact/live", "/api/platform"])
def test_staff_only(client, path):
    assert client.get(path).status_code == 403
    assert client.get(path, headers={"X-Role-Token": "wrong"}).status_code == 403
    assert client.get(path, headers=H).status_code == 200
