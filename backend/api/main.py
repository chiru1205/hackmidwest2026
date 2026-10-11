"""Civic Flow API. Run: .venv/Scripts/python -m uvicorn backend.api.main:app --port 8000"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, edge, events, seed, store
from .routes import admin, analytics, devrev, geofence, impact, ops, reports, users

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("civicflow.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.init()
    events.init()
    if seed.is_empty():
        log.info("empty database, seeding")
        try:
            seed.seed()
        except Exception:
            log.exception("seeding failed")
    else:
        edge.warm()
    try:  # a restart loses running checks: clear stale "checking" verdicts and check cases still awaiting verification
        from backend.agents import verify
        verify.resume_pending()
    except Exception:
        log.exception("resuming agent checks failed")
    log.info("Civic Flow API ready: %s", config.flags.model_dump())
    yield


app = FastAPI(title="Civic Flow API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["*"])
for r in (reports.router, users.router, ops.router, admin.router, analytics.router, geofence.router, devrev.router,
          impact.router):
    app.include_router(r, prefix="/api")
app.mount("/photos", StaticFiles(directory=str(config.PHOTO_DIR)), name="photos")
