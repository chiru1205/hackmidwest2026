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


def start(req: SimulateRequest) -> None:
    global cancel_flag
    cancel_flag = False
    t = asyncio.get_running_loop().create_task(_run(req))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def cancel_all() -> None:
    global cancel_flag
    cancel_flag = True


async def _run(req: SimulateRequest) -> None:
    total = max(0, req.count)
    users = max(1, req.users)
    delay = 1.0 / req.rate_per_s if req.rate_per_s > 0 else 0.0
    every = max(1, total // 50)
    events.publish("simulate.progress", {"done": 0, "total": total})
    cos = math.cos(math.radians(req.lat)) or 1.0
    done = 0
    try:
        for i in range(total):
            if cancel_flag:
                break
            dx, dy = random.gauss(0, req.spread_m), random.gauss(0, req.spread_m)
            lat = req.lat + dy / 111320.0
            lng = req.lng + dx / (111320.0 * cos)
            try:
                await pipeline.submit_report(f"sim_u{random.randint(1, users)}", lat, lng, 10.0, req.category,
                                             "simulated report", random.choice([2, 3, 3, 4]), None,
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
