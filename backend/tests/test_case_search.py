"""Semantic case search on the Workflow page: ranking, threshold, fallback, id precedence, index caching and batching.
The embedding module is faked (a tiny concept-count embedder), so there is no network and no model call."""
import math
import threading
import time

import pytest

from backend.integrations.devrev import board, case_search, cases
from contracts.models import CaseList, Cluster

ASOF = "2026-10-10T12:00:00Z"
AXES = (("flood", "water", "flooding", "rain"), ("light", "lamp", "dark", "streetlight"), ("hole", "pothole", "tires"),
        ("tree", "branch"), ("trash", "dumped", "couch"), ("graffiti", "paint"))


def fake_vec(text: str) -> list[float]:
    t = text.lower()
    return [float(sum(t.count(w) for w in axis)) for axis in AXES] + [0.5]   # the last axis keeps every vector non-zero


class FakeEmbed:
    """Replaces the hosted embedding module: records every request (index builds run on the case-index thread), can fail."""

    def __init__(self):
        self.calls: list[list[str]] = []
        self.batches: list[list[str]] = []
        self.queries: list[str] = []
        self.fail = False

    async def embed(self, texts):
        self.calls.append(list(texts))
        if threading.current_thread().name == "case-index":
            self.batches.append(list(texts))
        else:
            self.queries.append(texts[0])
        if self.fail:
            return None
        assert len(texts) <= case_search.BATCH, "one request must never exceed the batch size"
        return [fake_vec(t) for t in texts]


@pytest.fixture(autouse=True)
def fx(tmp_path, monkeypatch):
    from backend.integrations.devrev import events
    monkeypatch.setenv("DB_PATH", str(tmp_path / "cases.db"))
    monkeypatch.setattr(events, "_ready", False)
    fake = FakeEmbed()
    monkeypatch.setattr(case_search.embed, "embed", fake.embed)
    monkeypatch.setattr(case_search.embed, "enabled", lambda: True)
    monkeypatch.setattr(case_search, "_pace", 0.0)
    case_search.reset()
    yield fake
    wait_idle()
    case_search.reset()


def wait_idle(timeout=5.0):
    end = time.monotonic() + timeout
    while case_search._state["building"] and time.monotonic() < end:
        time.sleep(0.01)
    assert not case_search._state["building"], "the index build did not finish"


CATS = {"flooding": "Street flooded, water over the curb", "streetlight_out": "Lamp out, dark crossing",
        "pothole": "Deep pothole that wrecks tires", "downed_tree": "Branch across the road",
        "illegal_dumping": "Couch and trash dumped", "graffiti": "Graffiti paint on a wall"}


def make(monkeypatch, specs, stage="in_progress"):
    """specs: list of (num, category, bucket[, stage]). Returns the tickets; cluster text comes from CATS."""
    ts, cl = [], {}
    for sp in specs:
        i, cat, bucket = sp[:3]
        st = sp[3] if len(sp) > 3 else stage
        cid = f"c_{i}"
        cl[cid] = Cluster(id=cid, category=cat, lat=39.0, lng=-94.5, hazard_description=CATS[cat], neighborhood="Westport",
                          address=f"{i} Main St", rationale=f"Priority {bucket} (20/100), severity 2/5, 3 unique reporters.",
                          first_reported_at=ASOF, last_reported_at=ASOF)
        ts.append({"id": f"CF-{i}", "devrev_id": f"TKT-{i}", "title": f"[{bucket}] {cat} - {i} Main St", "cluster_id": cid,
                   "stage_key": st, "severity": "medium", "priority_bucket": bucket, "vendor": None, "owner": None,
                   "neighborhood": "Westport", "district": "District 4", "zones": [], "reporters": 2, "age_s": 3600.0 + i,
                   "due": None, "overdue": False, "escalated": False, "evidence_count": 0, "web_url": None})
    monkeypatch.setattr(board, "all_tickets", lambda: (list(ts), "local board", ASOF))
    monkeypatch.setattr(board, "_clusters", lambda: cl)
    return ts


def search(q, **kw):
    return cases.list_cases(group="all", q=q, **kw)


def ready_search(q, **kw):
    """First search starts the background build; once it is done, search again."""
    first = search(q, **kw)
    wait_idle()
    return first, search(q, **kw)


def ids(res):
    return [r["id"] for r in res["items"]]


@pytest.fixture
def board6(monkeypatch):
    return make(monkeypatch, [(1, "flooding", "P2"), (2, "streetlight_out", "P3"), (3, "pothole", "P4"),
                              (4, "downed_tree", "P4"), (5, "illegal_dumping", "P4"), (6, "graffiti", "P4")])


# ---------------------------------------------------------------- text
def test_case_text_carries_the_meaning_and_not_the_template(monkeypatch):
    ts = make(monkeypatch, [(1, "flooding", "P2")])
    c = board._clusters()["c_1"]
    t = dict(ts[0], zones=["School zone: Gordon Parks Elementary School"])
    text = case_search.case_text(t, c)
    assert "Flooding" in text and "Standing water" in text            # category label and plain description
    assert "Street flooded, water over the curb" in text               # hazard description
    assert "1 Main St" in text and "Westport" in text and "District 4" in text
    assert "School zone: Gordon Parks Elementary School" in text
    assert "Priority P2" not in text and "20/100" not in text           # the numeric template adds noise, not meaning


# ---------------------------------------------------------------- ranking, threshold
def test_semantic_matches_follow_the_substring_matches(board6, fx):
    first, res = ready_search("water everywhere on the road")
    assert first["semantic"] is False and first["total"] == 0         # not ready yet: plain search only
    assert res["semantic"] is True
    assert ids(res) == ["CF-1"]                                        # the flooding case, no word in common with the query


def test_exact_word_match_stays_first_and_semantic_follows(board6):
    # "pothole" is a substring of CF-3's title; the lamp case is only a meaning match for "dark street"
    ready_search("dark street")
    res = search("dark street")
    assert ids(res) == ["CF-2"] and res["semantic"] is True
    sub = search("pothole")
    assert ids(sub)[0] == "CF-3"                                       # the substring hit is first
    assert sub["total"] == len(sub["items"])


def test_nothing_below_the_threshold(board6):
    _, res = ready_search("bakery opening hours")
    assert res["items"] == [] and res["semantic"] is False and res["total"] == 0


def test_only_the_closest_band_is_returned(monkeypatch, fx):
    # three lamp cases and one flood case; "dark lamp" fits all lamp cases equally and the flood case not at all
    make(monkeypatch, [(1, "streetlight_out", "P3"), (2, "streetlight_out", "P3"), (3, "streetlight_out", "P4"),
                       (4, "flooding", "P2")])
    _, res = ready_search("dark lamp")
    assert sorted(ids(res)) == ["CF-1", "CF-2", "CF-3"]


def test_hits_are_ordered_by_similarity(monkeypatch):
    make(monkeypatch, [(1, "streetlight_out", "P4"), (2, "flooding", "P4")])
    c2 = board._clusters()["c_2"]
    c2.hazard_description = "flooding water rain flood"                # a much stronger flood case than CF-1 is a lamp case
    monkeypatch.setattr(case_search, "BAND", 1.0)                       # see the whole ordering
    monkeypatch.setattr(case_search, "MIN_SIM", 0.0)
    _, res = ready_search("water and a lamp")
    assert ids(res)[0] == "CF-2"


def test_district_filter_applies_to_semantic_matches(monkeypatch):
    ts = make(monkeypatch, [(1, "flooding", "P2"), (2, "flooding", "P3")])
    ts[1]["district"] = "District 9"
    _, res = ready_search("water everywhere", district="District 9")
    assert ids(res) == ["CF-2"]


def test_resolved_cases_are_not_indexed_but_still_substring_searchable(monkeypatch, fx):
    make(monkeypatch, [(1, "flooding", "P2"), (2, "flooding", "P3", "resolved")])
    ready_search("water everywhere")
    assert sum(len(b) for b in fx.batches) == 1                        # only the open case was embedded
    assert ids(search("flooding")) == ["CF-1", "CF-2"]                 # both by words; the open one first


# ---------------------------------------------------------------- id precedence
def test_exact_case_id_skips_semantic(board6, fx):
    res = search("CF-1")
    assert ids(res) == ["CF-1"] and res["semantic"] is False
    res = search("tkt-2")
    assert ids(res) == ["CF-2"]                                        # a ticket id matches its case exactly too
    assert fx.calls == []                                              # no index build and no query embedding at all


def test_id_shaped_query_never_goes_semantic(board6, fx):
    res = search("CF-99")
    assert res["items"] == [] and res["semantic"] is False
    assert fx.calls == []


def test_short_query_is_substring_only(board6, fx):
    res = search("tr")
    assert res["semantic"] is False and fx.calls == []


def test_no_query_costs_nothing(board6, fx):
    res = search("")
    assert res["semantic"] is False and fx.calls == []


# ---------------------------------------------------------------- fallback
def test_embeddings_failing_falls_back_to_substring(board6, fx):
    fx.fail = True
    first = search("water everywhere on the road")
    wait_idle()
    second = search("water everywhere on the road")
    assert first["semantic"] is False and second["semantic"] is False
    assert second["total"] == 0
    assert ids(search("pothole")) == ["CF-3"]                          # plain search is untouched


def test_embeddings_disabled_makes_no_calls(board6, fx, monkeypatch):
    monkeypatch.setattr(case_search.embed, "enabled", lambda: False)
    res = search("water everywhere on the road")
    assert res["semantic"] is False and fx.calls == []


def test_failed_build_waits_before_retrying(board6, fx):
    fx.fail = True
    search("water everywhere on the road")
    wait_idle()
    n = len(fx.calls)
    search("water everywhere on the road")
    search("lamp is dark")
    wait_idle()
    assert len(fx.calls) == n                                          # a polling page does not hammer a failing service
    case_search._state["retry_at"] = 0.0
    fx.fail = False
    ready_search("water everywhere on the road")
    assert case_search._state["ready"] is True


def test_query_embedding_failure_is_remembered_briefly(board6, fx):
    ready_search("water everywhere")
    fx.fail = True
    r1 = search("brand new words about water")
    n = len(fx.calls)
    r2 = search("another new phrase about water")
    assert r1["semantic"] is False and r2["semantic"] is False
    assert len(fx.calls) == n                                          # the second search did not even try


def test_query_that_takes_too_long_gives_up(board6, fx, monkeypatch):
    ready_search("water everywhere")

    async def slow(texts):
        import asyncio
        await asyncio.sleep(5)

    monkeypatch.setattr(case_search.embed, "embed", slow)
    monkeypatch.setattr(case_search, "QUERY_BUDGET_S", 0.05)
    t0 = time.monotonic()
    res = search("something else about water")
    assert time.monotonic() - t0 < 2 and res["semantic"] is False


# ---------------------------------------------------------------- index: caching, batching, rate limit
def test_index_is_built_in_batches_and_cached(monkeypatch, fx):
    make(monkeypatch, [(i, "flooding", "P4") for i in range(1, 41)])   # 40 open cases
    search("water everywhere")
    wait_idle()
    assert [len(b) for b in fx.batches] == [16, 16, 8]                 # 3 requests, not 40
    n = len(fx.calls)
    for _ in range(3):
        search("water everywhere")
    assert len(fx.batches) == 3                                        # the index is not rebuilt; the repeats are only query calls
    assert len(fx.calls) - n == 3


def test_a_changed_case_is_re_embedded_alone(monkeypatch, fx):
    ts = make(monkeypatch, [(i, "flooding", "P4") for i in range(1, 21)])
    ready_search("water everywhere")
    fx.calls.clear(); fx.batches.clear(); fx.queries.clear()
    board._clusters()["c_7"].hazard_description = "the hole got worse"
    search("water everywhere")
    wait_idle()
    assert [len(b) for b in fx.batches] == [1]
    assert "the hole got worse" in fx.batches[0][0]
    assert len(ts) == 20


def test_new_case_is_added_without_rebuilding_and_without_going_dark(monkeypatch, fx):
    make(monkeypatch, [(i, "flooding", "P4") for i in range(1, 6)])
    ready_search("water everywhere")
    fx.calls.clear(); fx.batches.clear(); fx.queries.clear()
    make(monkeypatch, [(i, "flooding", "P4") for i in range(1, 7)])    # one more case arrives
    res = search("water everywhere")
    assert res["semantic"] is True                                     # stays usable while the new one is embedded
    wait_idle()
    assert [len(b) for b in fx.batches] == [1]


def test_closed_cases_leave_the_index(monkeypatch):
    make(monkeypatch, [(1, "flooding", "P4"), (2, "flooding", "P4")])
    ready_search("water everywhere")
    assert set(case_search._index) == {"CF-1", "CF-2"}
    make(monkeypatch, [(1, "flooding", "P4"), (2, "flooding", "P4", "resolved")])
    search("water everywhere")
    wait_idle()
    assert set(case_search._index) == {"CF-1"}


def test_cap_keeps_the_most_urgent_open_cases(monkeypatch, fx):
    monkeypatch.setattr(case_search, "CAP", 5)
    specs = [(i, "flooding", "P4") for i in range(1, 11)] + [(11, "flooding", "P1"), (12, "flooding", "P2")]
    make(monkeypatch, specs)
    search("water everywhere")
    wait_idle()
    assert sum(len(b) for b in fx.batches) == 5
    assert {"CF-11", "CF-12"} <= set(case_search._index)               # P1 and P2 come before any P4


def test_batches_are_paced_for_the_shared_rate_limit(monkeypatch, fx):
    sleeps = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(case_search, "_pace", case_search.PACE_S)
    monkeypatch.setattr(case_search.asyncio, "sleep", fake_sleep)
    make(monkeypatch, [(i, "flooding", "P4") for i in range(1, 51)])   # 50 cases = 4 batches
    search("water everywhere")
    wait_idle()
    assert len(fx.batches) == 4 and sleeps == [case_search.PACE_S] * 3
    assert 60 / case_search.PACE_S <= 30                                # at most half of the team's 60 requests/min
    full = case_search.CAP / case_search.BATCH
    assert math.ceil(full) <= 25                                        # a full 400-case build is 25 requests


def test_only_one_build_runs_at_a_time(monkeypatch, fx):
    gate = threading.Event()
    seen = []

    async def slow(texts):
        seen.append(len(texts))
        while not gate.is_set():
            import asyncio
            await asyncio.sleep(0.01)
        return [fake_vec(t) for t in texts]

    monkeypatch.setattr(case_search.embed, "embed", slow)
    make(monkeypatch, [(i, "flooding", "P4") for i in range(1, 6)])
    r = [search("water everywhere") for _ in range(5)]                  # a polling page asks again and again
    assert all(x["semantic"] is False for x in r)                       # never blocked, never half-answered
    threads = [t for t in threading.enumerate() if t.name == "case-index"]
    assert len(threads) == 1
    gate.set()
    wait_idle()
    assert seen == [5]


def test_search_never_waits_for_the_index(monkeypatch):
    make(monkeypatch, [(i, "flooding", "P4") for i in range(1, 6)])
    gate = threading.Event()

    async def stuck(texts):
        import asyncio
        while not gate.is_set():
            await asyncio.sleep(0.01)
        return [fake_vec(t) for t in texts]

    monkeypatch.setattr(case_search.embed, "embed", stuck)
    t0 = time.monotonic()
    res = search("water everywhere")
    assert time.monotonic() - t0 < 1.0 and res["semantic"] is False
    gate.set()


# ---------------------------------------------------------------- contract
def test_response_matches_the_contract(board6):
    _, res = ready_search("water everywhere")
    CaseList(**res)
    assert res["semantic"] is True
    assert search("")["semantic"] is False


# ---------------------------------------------------------------- warm-up: the first search should not find an empty index
def test_warm_once_builds_the_index_so_the_first_search_is_semantic(board6, fx):
    case_search.warm_once()
    deadline = time.monotonic() + 5
    while not case_search._state["ready"] and time.monotonic() < deadline:
        time.sleep(0.01)
    wait_idle()
    assert case_search._state["ready"]
    res = search("water everywhere on the road")                     # the very first search, no earlier attempt
    assert res["semantic"] is True and ids(res) == ["CF-1"]


def test_warm_once_runs_once_and_never_without_embeddings(board6, fx, monkeypatch):
    case_search.warm_once()
    case_search.warm_once()
    deadline = time.monotonic() + 5
    while not case_search._state["ready"] and time.monotonic() < deadline:
        time.sleep(0.01)
    wait_idle()
    assert len(fx.batches) == 1                                      # one build for six cases, however often it is asked
    case_search.reset()
    fx.batches.clear()
    monkeypatch.setattr(case_search.embed, "enabled", lambda: False)
    case_search.warm_once()
    assert case_search._state["warmed"] is False and fx.batches == []
