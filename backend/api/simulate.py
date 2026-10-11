"""Admin simulation: many synthetic reporters around a point, same pipeline, agents bypassed."""
from __future__ import annotations

import asyncio
import logging
import math
import random

from contracts.models import SimulateRequest

from . import events, pipeline

log = logging.getLogger("civicflow.simulate")
_tasks: set[asyncio.Task] = set()
cancel_flag = False
_generation = 0   # bumped by cancel_all so a reset really stops running simulations, even if cancel_flag is cleared right after


def start(req: SimulateRequest) -> None:
    global cancel_flag
    cancel_flag = False
    t = asyncio.get_running_loop().create_task(_run(req))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def cancel_all() -> None:
    global cancel_flag, _generation
    cancel_flag = True
    _generation += 1


# Categories that fail at a handful of discrete spots (a pole, a lot, a tree, a crossing) rather than as a
# diffuse area: a wide-spread storm of these concentrates on a few "intersections" instead of a smooth cloud.
SPOTTY = {"streetlight_out", "traffic_signal", "illegal_dumping", "downed_tree", "graffiti", "sidewalk_damage",
          "manhole_cover", "road_debris"}
SPOT_JITTER_M = 7.0


def _spots(req: SimulateRequest) -> list[tuple[float, float, float]]:
    """Spot centres (dx, dy, weight) in metres for a spotty category with a wide spread; [] means plain gaussian."""
    if req.category not in SPOTTY or req.spread_m < 300:
        return []
    rnd = random.Random(f"{req.category}:{req.lat:.4f}:{req.lng:.4f}")
    k = max(4, min(18, req.count // 25))
    out = []
    for i in range(k):
        r = req.spread_m * math.sqrt(rnd.random())
        a = rnd.uniform(0, math.tau)
        out.append((r * math.cos(a), r * math.sin(a), 1.0 / (i + 1) ** 0.6))   # a few big problems, a long tail
    return out


async def _run(req: SimulateRequest) -> None:
    gen = _generation
    total = max(0, req.count)
    users = max(1, req.users)
    delay = 1.0 / req.rate_per_s if req.rate_per_s > 0 else 0.0
    every = max(1, total // 50)
    events.publish("simulate.progress", {"done": 0, "total": total})
    cos = math.cos(math.radians(req.lat)) or 1.0
    done = 0
    spots = _spots(req)
    weights = [w for _, _, w in spots]
    try:
        for i in range(total):
            if cancel_flag or gen != _generation:
                break
            if spots:
                sx, sy, _ = random.choices(spots, weights=weights)[0]
                dx, dy = sx + random.gauss(0, SPOT_JITTER_M), sy + random.gauss(0, SPOT_JITTER_M)
            else:
                dx, dy = random.gauss(0, req.spread_m), random.gauss(0, req.spread_m)
            lat = req.lat + dy / 111320.0
            lng = req.lng + dx / (111320.0 * cos)
            try:
                await pipeline.submit_report(f"sim_u{random.randint(1, users)}", lat, lng, 10.0, req.category,
                                             "storm demo report", random.choice([2, 3, 3, 4]), None,
                                             simulated=True, quiet_stats=(i % 5 != 0))
            except Exception as e:
                log.warning("simulated report failed: %s", e)
            done += 1
            if done % every == 0:
                events.publish("simulate.progress", {"done": done, "total": total})
            await asyncio.sleep(delay)
    finally:
        pipeline.publish_stats()
        events.publish("simulate.progress", {"done": done, "total": total})
