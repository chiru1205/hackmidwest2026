"""Edge cache: Cluster JSON per geohash7 cell, held in an EdgeKV-shaped store."""
from __future__ import annotations

import time

from contracts.models import Cluster, EdgeInfo
from backend.engine import dedup, geo

from . import adapters, store

NS, GROUP = "civicflow", "cells"
kv = adapters.make_edgekv()


def reset_kv() -> None:
    global kv
    for cell in list(store.cells):
        try:
            kv.delete(NS, GROUP, cell)
        except Exception:
            pass
    kv = adapters.make_edgekv()


def refresh_cell(cell: str) -> list[dict]:
    """Rebuild one cell's cache entry from the in-memory index (open clusters only)."""
    val = [store.clusters[i].model_dump(mode="json") for i in sorted(store.cells.get(cell, ()))
           if i in store.clusters and store.clusters[i].status != "fixed"]
    try:
        kv.put(NS, GROUP, cell, val)
    except Exception:
        pass
    return val


def refresh(c: Cluster) -> None:
    """Call on every cluster create / merge / status change."""
    refresh_cell(store.cell_of(c))


def warm() -> None:
    for cell in list(store.cells):
        refresh_cell(cell)


def _get(cell: str):
    try:
        return kv.get(NS, GROUP, cell)
    except Exception:
        return None


def lookup(lat: float, lng: float, extra_radius_m: float = 0.0) -> tuple[list[Cluster], EdgeInfo]:
    """Clusters in the 3x3 cell block around a point. Returns live Cluster objects and hit/miss + ms."""
    t0 = time.perf_counter()
    cell = geo.geohash(lat, lng, 7)
    hit, out = True, {}
    for c in [cell] + list(geo.neighbors(cell)):
        v = _get(c)
        if v is None:
            hit = False
            v = refresh_cell(c)
        for d in v:
            live = store.clusters.get(d["id"])
            if live is not None and live.status != "fixed":
                out[live.id] = live
    ms = (time.perf_counter() - t0) * 1000
    if extra_radius_m > 150:  # the 3x3 block only guarantees ~150 m; scan the in-memory set for big radii
        for c in store.clusters.values():
            if c.status != "fixed" and c.id not in out and geo.haversine_m(lat, lng, c.lat, c.lng) <= extra_radius_m:
                out[c.id] = c
    store.counters["edge_hits" if hit else "edge_misses"] += 1
    store.counters["edge_ms_sum"] += ms
    store.counters["edge_n"] += 1
    return list(out.values()), EdgeInfo(hit=hit, ms=round(ms, 3), cell=cell)


def candidates(lat: float, lng: float, category: str):
    """Scored candidate tuples (cluster, score, distance_m) for the dedup engine, plus edge info."""
    r_max = dedup.radii(category)[1]
    clusters, edge = lookup(lat, lng, r_max)
    out = []
    for c in clusters:
        s, d = dedup.score_candidate(lat, lng, category, c)
        out.append((c, s, d))
    return out, edge
