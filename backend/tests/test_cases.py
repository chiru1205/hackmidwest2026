"""Workflow page case journey: list grouping/search/paging/scale and the six-station detail. No network, no DevRev."""
import time

import pytest

from backend.integrations.devrev import board, cases
from contracts.models import Cluster

ASOF = "2026-10-10T12:00:00Z"
DAY = 86400.0


@pytest.fixture(autouse=True)
def _scratch_db(tmp_path, monkeypatch):
    """Case lists and details read the agent verdicts and counts from the events DB: keep it off the dev database."""
    from backend.integrations.devrev import events
    monkeypatch.setenv("DB_PATH", str(tmp_path / "cases.db"))
    monkeypatch.setattr(events, "_ready", False)


def tk(i, key="in_progress", bucket="P3", age=3600.0, overdue=False, esc=False, **kw):
    t = {"id": f"CF-{i}", "devrev_id": f"TKT-{i}", "title": f"[{bucket}] Pothole - {i} Main St", "cluster_id": f"c_{i}",
         "stage_key": key, "severity": "medium", "priority_bucket": bucket, "vendor": "KC Road Crew Co.", "owner": None,
         "neighborhood": "Westport", "district": "District 4", "zones": [], "reporters": 2, "age_s": age, "due": None,
         "overdue": overdue, "escalated": esc, "evidence_count": 0, "web_url": None}
    t.update(kw)
    return t


def feed(monkeypatch, tickets, source="local board"):
    monkeypatch.setattr(board, "all_tickets", lambda: (list(tickets), source, ASOF))


def ids(res):
    return [r["id"] for r in res["items"]]


@pytest.fixture
def mixed(monkeypatch):
    ts = [
        tk(1, "awaiting_verification", "P2", 500),
        tk(2, "in_progress", "P1", 100, overdue=True),
        tk(3, "queued", "P3", 2 * DAY),                       # no crew
        tk(4, "assigned", "P4", 3 * DAY),                     # assigned, so not "no crew"
        tk(5, "in_progress", "P1", 50, esc=True),
        tk(6, "resolved", "P1", 9000, overdue=True, esc=True),  # resolved: no reasons at all
        tk(7, "in_progress", "P3", 9000),
        tk(8, "queued", "P1", 60),                            # fresh queued
    ]
    feed(monkeypatch, ts)
    return ts


def test_reasons():
    assert cases.reasons_of(tk(1, "awaiting_verification")) == ["approval"]
    assert cases.reasons_of(tk(1, "in_progress", overdue=True, esc=True)) == ["overdue", "escalated"]
    assert cases.reasons_of(tk(1, "queued", age=DAY + 1)) == ["no_crew"]
    assert cases.reasons_of(tk(1, "queued", age=DAY)) == []
    assert cases.reasons_of(tk(1, "assigned", age=5 * DAY)) == []
    assert cases.reasons_of(tk(1, "resolved", overdue=True, esc=True, age=9 * DAY)) == []


def test_groups_and_counts(mixed):
    needs = cases.list_cases("needs")
    assert set(ids(needs)) == {"CF-1", "CF-2", "CF-3", "CF-5"} and needs["total"] == 4
    assert needs["counts"] == {"open": 7, "approval": 1, "overdue": 1, "escalated": 1, "no_crew": 1, "needs_you": 4, "agent_closed": 0}
    assert ids(cases.list_cases("approval")) == ["CF-1"]
    assert ids(cases.list_cases("overdue")) == ["CF-2"]
    assert ids(cases.list_cases("escalated")) == ["CF-5"]
    assert ids(cases.list_cases("no_crew")) == ["CF-3"]
    assert needs["items"][0]["reasons"] and needs["source"] == "local board" and needs["as_of"] == ASOF


def test_needs_you_is_distinct(monkeypatch):
    feed(monkeypatch, [tk(1, "awaiting_verification", overdue=True, esc=True), tk(2)])
    r = cases.list_cases("needs")
    assert r["counts"]["needs_you"] == 1 and r["total"] == 1
    assert r["items"][0]["reasons"] == ["approval", "overdue", "escalated"]


def test_all_puts_resolved_last_and_counts_ignore_filters(mixed):
    r = cases.list_cases("all")
    assert r["total"] == 8 and ids(r)[-1] == "CF-6"
    f = cases.list_cases("approval", q="nothing-matches-this")
    assert f["total"] == 0 and f["counts"] == r["counts"]
    d = cases.list_cases("all", district="District 9")
    assert d["total"] == 0 and d["counts"]["open"] == 7


def test_sort_order(mixed):
    # P1 first; within a bucket rows with reasons before those without, then older first
    assert ids(cases.list_cases("all")) == ["CF-2", "CF-5", "CF-8", "CF-1", "CF-3", "CF-7", "CF-4", "CF-6"]


def test_needs_list_is_ordered_by_rail_group_first(monkeypatch):
    # a P4 awaiting approval must come before a P1 overdue case, so every page holds whole groups in rail order
    feed(monkeypatch, [tk(1, "in_progress", "P1", 100, overdue=True), tk(2, "awaiting_verification", "P4", 100),
                       tk(3, "in_progress", "P1", 100, esc=True), tk(4, "queued", "P2", 2 * DAY)])
    assert ids(cases.list_cases("needs")) == ["CF-2", "CF-1", "CF-3", "CF-4"]
    assert ids(cases.list_cases("all"))[0] == "CF-1"  # browsing keeps pure urgency order


def test_resolved_are_newest_closed_first(monkeypatch):
    feed(monkeypatch, [tk(1, "resolved", age=9000.0), tk(2, "resolved", age=10.0), tk(3, "resolved", age=500.0)])
    monkeypatch.setitem(board._cache, "closed", {"CF-1": 100.0, "CF-2": 300.0, "CF-3": 200.0})
    assert ids(cases.list_cases("all")) == ["CF-2", "CF-3", "CF-1"]


def test_search(mixed):
    assert ids(cases.list_cases("all", q="tkt-3")) == ["CF-3"]
    assert ids(cases.list_cases("all", q="cf-7")) == ["CF-7"]
    assert cases.list_cases("all", q="  WESTPORT ")["total"] == 8
    assert cases.list_cases("all", q="district 4")["total"] == 8
    assert cases.list_cases("all", q="road crew")["total"] == 8
    assert ids(cases.list_cases("all", q="7 main")) == ["CF-7"]
    assert ids(cases.list_cases("all", q="c_5")) == ["CF-5"]  # by cluster id, so a new report can be found


def test_district_filter_is_exact(monkeypatch):
    feed(monkeypatch, [tk(1, district="District 4"), tk(2, district="District 40"), tk(3, district="District 6")])
    assert ids(cases.list_cases("all", district="district 4")) == ["CF-1"]


def test_paging_is_stable_and_complete(monkeypatch):
    feed(monkeypatch, [tk(i, bucket="P1", age=1000.0) for i in range(1, 38)])  # all tie on urgency: id breaks it
    pages = [ids(cases.list_cases("all", limit=10, offset=o)) for o in (0, 10, 20, 30, 40)]
    flat = [x for p in pages for x in p]
    assert [len(p) for p in pages] == [10, 10, 10, 7, 0]
    assert len(flat) == len(set(flat)) == 37
    assert flat == ids(cases.list_cases("all", limit=100))
    assert cases.list_cases("all", limit=10, offset=30)["total"] == 37
    assert len(cases.list_cases("all", limit=1000)["items"]) == 37  # clamped to 100, only 37 exist


def test_scale_3000_tickets_filter_under_300ms(monkeypatch):
    keys = ["queued", "assigned", "in_progress", "awaiting_verification", "resolved"]
    big = [tk(i, keys[i % 5], f"P{1 + i % 4}", float((i * 7919) % (6 * 86400)), overdue=i % 11 == 0, esc=i % 17 == 0,
              neighborhood=f"Hood {i % 40}") for i in range(3000)]
    feed(monkeypatch, big)
    cases.list_cases("needs")  # warm up
    t0 = time.perf_counter()
    r = cases.list_cases("needs", q="hood 7", district="District 4", limit=30, offset=0)
    dt = time.perf_counter() - t0
    assert dt < 0.3, f"{dt * 1000:.0f} ms"
    assert r["total"] > 0 and len(r["items"]) <= 30
    assert r["counts"]["open"] == sum(1 for t in big if t["stage_key"] != "resolved")
    t0 = time.perf_counter()
    cases.list_cases("all", limit=100, offset=2900)
    assert time.perf_counter() - t0 < 0.3


# ---------------------------------------------------------------- detail
def cluster(**kw):
    base = dict(id="c_1", category="pothole", lat=39.05, lng=-94.59, severity=4, is_hazard=True, reporter_count=5,
                report_count=6, priority=82.4, bucket="P1", rationale="Why it matters.", location_crit=1.0,
                neighborhood="Westport", district="District 4", zones=["School zone: Westport Elementary"],
                address="1 Main St", photo_url="/photos/seed/a.jpg", vendor="KC Road Crew Co.",
                first_reported_at="2026-10-09T00:00:00Z", last_reported_at="2026-10-09T01:00:00Z")
    base.update(kw)
    return Cluster(**base)


def step(kind, title="x", detail="", source="civicflow", ts="2026-10-09T01:00:00Z"):
    return {"ts": ts, "source": source, "kind": kind, "title": title, "detail": detail}


def wire(monkeypatch, key="in_progress", c=None, steps=None, fix=False, **tkw):
    c = c or cluster()
    t = tk(1, key, "P1", cluster_id=c.id, reporters=c.reporter_count, **tkw)
    steps = steps if steps is not None else [step("report", ts="2026-10-09T00:00:00Z"), step("dedup"), step("created")]
    monkeypatch.setattr(board, "_clusters", lambda: {c.id: c})
    monkeypatch.setattr(board, "journey", lambda cf: {"ticket": t, "steps": steps} if cf == "CF-1" else None)
    monkeypatch.setattr(board, "fix_photo_exists", lambda cid: fix)
    monkeypatch.setattr(cases, "raw_rows", lambda: [{"id": "CF-1", "devrev_display": "TKT-1"}])
    return t


@pytest.mark.parametrize("key,states,can", [
    ("queued", "done done done now todo todo", ["start", "escalate"]),
    ("assigned", "done done done now todo todo", ["start", "escalate"]),
    ("in_progress", "done done done now todo todo", ["request_verification", "approve", "escalate"]),
    ("awaiting_verification", "done done done done now todo", ["approve", "escalate", "reopen"]),
    ("resolved", "done done done done done done", ["reopen"]),
])
def test_stations_states_and_can(monkeypatch, key, states, can):
    wire(monkeypatch, key)
    d = cases.case_detail("CF-1")
    assert [s["key"] for s in d["stations"]] == ["reported", "understood", "ticket", "crew", "verify", "told"]
    assert " ".join(s["state"] for s in d["stations"]) == states
    assert d["can"] == can
    assert all(s["ts"] is None for s in d["stations"] if s["state"] == "todo")


def test_detail_by_tkt_id_and_station_text(monkeypatch):
    wire(monkeypatch, "awaiting_verification")
    d = cases.case_detail("tkt-1")
    st = {s["key"]: s for s in d["stations"]}
    assert st["reported"]["detail"] == "5 neighbors sent photos and notes"
    assert st["understood"]["chip"] == "Civic Flow" and st["understood"]["chip_source"] == "civicflow"   # no model ran for this case
    assert st["ticket"]["chip"] == "DevRev - TKT-1" and st["ticket"]["chip_source"] == "devrev"
    # the chip names DevRev's own stage (awaiting verification is a Civic Flow flag, DevRev says in progress)
    assert st["crew"]["detail"] == "KC Road Crew Co." and st["crew"]["chip"] == "DevRev - In progress"
    assert st["verify"]["detail"] == "Marked ready for your check" and st["verify"]["chip_source"] == "civicflow"
    assert st["told"]["detail"] == "5 neighbors get Fixed!" and st["told"]["chip"] == "DevRev - Resolved"
    assert st["reported"]["ts"] == "2026-10-09T00:00:00Z"


def test_verify_detail_mentions_photo_only_when_it_exists(monkeypatch):
    wire(monkeypatch, "awaiting_verification", fix=True)
    st = {s["key"]: s for s in cases.case_detail("CF-1")["stations"]}
    assert st["verify"]["detail"] == "Marked ready for your check, with an after-photo"


def test_can_follows_the_rules(monkeypatch):
    wire(monkeypatch, "in_progress", severity="blocker")
    assert cases.case_detail("CF-1")["can"] == ["request_verification", "approve"]  # nothing above blocker
    assert cases.can_do("resolved", "blocker") == ["reopen"]


def test_local_ticket_has_no_devrev_claims(monkeypatch):
    wire(monkeypatch, "queued", devrev_id=None)
    d = cases.case_detail("CF-1")
    assert d["devrev"] == {"display_id": None, "stage": None, "severity": None, "part": None, "owner": None,
                           "external_ref": None, "web_url": None, "synced": False}
    assert d["stations"][2]["chip"] == "Local ticket" and d["stations"][2]["chip_source"] == "civicflow"


def test_devrev_record_and_scoring(monkeypatch):
    monkeypatch.setenv("DEVREV_PART", "PROD-7")
    monkeypatch.setenv("DEVREV_OWNER_DEVU", "DEVU-9")
    wire(monkeypatch, "awaiting_verification", web_url="https://app.devrev.ai/x/TKT-1", severity="high")
    d = cases.case_detail("CF-1")
    assert d["devrev"] == {"display_id": "TKT-1", "stage": "work_in_progress", "severity": "high", "part": "PROD-7",
                           "owner": "DEVU-9", "external_ref": "c_1", "web_url": "https://app.devrev.ai/x/TKT-1", "synced": True}
    assert d["priority_score"] == 82.4 and d["rationale"] == "Why it matters." and d["duplicates_avoided"] == 4
    f = {x["label"]: x for x in d["factors"]}
    assert [x["label"] for x in d["factors"]] == ["Severity", "Neighbors reporting", "Safety hazard", "Location"]
    assert f["Severity"]["value"] == "4 of 5" and f["Severity"]["pct"] == 80
    assert f["Neighbors reporting"]["value"] == "5" and 33 < f["Neighbors reporting"]["pct"] < 35
    assert f["Safety hazard"]["value"] == "Yes" and f["Safety hazard"]["pct"] == 85
    assert f["Location"]["value"] == "School zone" and f["Location"]["pct"] == 100
    assert d["category"] == "pothole" and d["address"] == "1 Main St"


def test_factors_without_hazard_or_zone(monkeypatch):
    wire(monkeypatch, c=cluster(is_hazard=False, zones=[], location_crit=0.2, reporter_count=500))
    f = {x["label"]: x for x in cases.case_detail("CF-1")["factors"]}
    assert f["Safety hazard"]["value"] == "No" and f["Safety hazard"]["pct"] == 0
    assert f["Location"]["value"] == "Standard" and f["Location"]["pct"] == 20
    assert f["Neighbors reporting"]["pct"] == 100


def test_location_label_follows_criticality_without_zones(monkeypatch):
    wire(monkeypatch, c=cluster(zones=[], location_crit=0.8))
    f = {x["label"]: x for x in cases.case_detail("CF-1")["factors"]}
    assert f["Location"]["value"] == "Arterial corridor" and f["Location"]["pct"] == 80


def test_photos_and_crew_note(monkeypatch):
    steps = [step("report"), step("verification", "TKT-1: awaiting verification (Patched and compacted.)"),
             step("comment", "Comment by Sam", "Will check Friday", source="devrev"),
             step("stage", "TKT-1: work started")]
    wire(monkeypatch, "awaiting_verification", steps=steps, fix=True)
    d = cases.case_detail("CF-1")
    assert d["before_photo_url"] == "/photos/seed/a.jpg" and d["after_photo_url"] == "/photos/fix_c_1.jpg"
    # only the note sent with the verification request is quoted, never someone else's DevRev comment
    assert d["crew_note"] == "Patched and compacted."
    assert d["timeline"] == steps
    wire(monkeypatch, "awaiting_verification", steps=[step("comment", "Comment by Sam", "Will check Friday", source="devrev")])
    assert cases.case_detail("CF-1")["crew_note"] is None
    steps2 = [step("verification", "TKT-1: awaiting verification (Filled and sealed) [DevRev comment not posted]"),
              step("resolved", "TKT-1: approved and resolved (Looks good)")]
    wire(monkeypatch, "awaiting_verification", steps=steps2[:1])
    assert cases.case_detail("CF-1")["crew_note"] == "Filled and sealed"
    # an old note never resurfaces once the case is back in progress or closed
    for key in ("in_progress", "resolved", "queued"):
        wire(monkeypatch, key, steps=steps2)
        d2 = cases.case_detail("CF-1")
        assert d2["crew_note"] is None and d2["after_photo_url"] is None


def test_unknown_ids_raise_not_found(monkeypatch):
    wire(monkeypatch)
    for bad in ("CF-999", "TKT-999"):
        with pytest.raises(cases.NotFound):
            cases.case_detail(bad)


def test_routes_validate_and_404(monkeypatch):
    from fastapi.testclient import TestClient

    from backend.api.main import app
    from backend.integrations.devrev import case_search
    monkeypatch.setattr(case_search.embed, "enabled", lambda: False)   # opening the list may start an index build: never in a test
    wire(monkeypatch)
    feed(monkeypatch, [tk(1)])
    c = TestClient(app)
    h = {"X-Role-Token": "civicflow-city-demo"}
    assert c.get("/api/devrev/cases").status_code in (401, 403)
    r = c.get("/api/devrev/cases?group=all&limit=5", headers=h)
    assert r.status_code == 200 and r.json()["total"] == 1
    assert c.get("/api/devrev/cases?group=bogus", headers=h).status_code == 422
    assert c.get("/api/devrev/cases?limit=0", headers=h).status_code == 422
    assert c.get("/api/devrev/cases?offset=-1", headers=h).status_code == 422
    assert c.get("/api/devrev/ticket/CF-1/case", headers=h).status_code == 200
    assert c.get("/api/devrev/ticket/TKT-404/case", headers=h).status_code == 404


def test_build_serves_the_last_snapshot_while_another_thread_rebuilds(monkeypatch):
    import threading
    started, release, calls = threading.Event(), threading.Event(), []

    def slow_collect(now):
        calls.append(1)
        started.set()
        release.wait(5)
        return [tk(2)], "local board", set()

    import backend.integrations.devrev as dr
    monkeypatch.setattr(dr, "_ensure_poller", lambda: None)
    monkeypatch.setattr(board, "collect", slow_collect)
    monkeypatch.setattr(board, "_clusters", lambda: {})
    monkeypatch.setitem(board._cache, "data", {"source": "old", "as_of": ASOF, "totals": {}})
    monkeypatch.setitem(board._cache, "at", time.monotonic() - 60)  # stale, but a snapshot exists
    t = threading.Thread(target=board.build)
    t.start()
    assert started.wait(5)
    t0 = time.perf_counter()
    assert board.build()["source"] == "old"  # does not queue behind the slow rebuild
    assert time.perf_counter() - t0 < 0.5 and len(calls) == 1
    release.set()
    t.join(5)
    assert board.build()["source"] == "local board"


def test_understood_chip_names_only_what_the_saved_trace_shows(monkeypatch):
    import json

    from backend.api import store
    c = Cluster(id="c_9", category="pothole", lat=39.0, lng=-94.5, first_reported_at=ASOF, last_reported_at=ASOF)

    def chip(trace):
        monkeypatch.setattr(store, "meta_get", lambda k: json.dumps(trace) if k == "trace:c_9" else None)
        return cases.understood_chip(c)

    vision = {"node": "intake", "status": "done", "summary": "vision: pothole, severity 3", "model": None}
    form = {"node": "intake", "status": "done", "summary": "form: pothole, severity 3", "model": "form"}
    note = {"node": "intake", "status": "done", "summary": "akamai-embedding: pothole, severity 3", "model": "form"}
    judge = {"node": "judge", "status": "done", "summary": "merge", "model": "akamai:hackathon-embedding"}
    assert chip([]) == "Civic Flow" and chip([form]) == "Civic Flow"
    assert chip([vision]) == "AI vision" and chip([note]) == "Akamai AI"
    assert chip([vision, judge]) == "AI vision + Akamai AI"
