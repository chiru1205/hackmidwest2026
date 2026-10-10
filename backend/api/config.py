"""Runtime configuration and feature flags (env + .env)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from contracts.models import Flags

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DB_PATH = os.getenv("DB_PATH") or str(ROOT / "data" / "civicflow.db")
PHOTO_DIR = ROOT / "data" / "photos"
SEED_DIR = ROOT / "data" / "seed"
PHOTO_DIR.mkdir(parents=True, exist_ok=True)
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)


def _bool(v: str | None, default: bool) -> bool:
    if v is None or v == "":
        return default
    return v.strip().lower() in ("1", "true", "on", "yes")


def load_flags() -> Flags:
    env = os.getenv
    agents_default = "graph" if env("AKAMAI_AI_KEY") else "det"
    raw = dict(
        model_provider=env("MODEL_PROVIDER") or "akamai",
        agents_mode=env("AGENTS_MODE") or agents_default,
        vision=_bool(env("VISION"), False),
        devrev_mode=env("DEVREV_MODE") or "mock",
        storage=env("STORAGE") or "local",
        edgekv_backend=env("EDGEKV_BACKEND") or "memory",
        demo_mode=_bool(env("DEMO_MODE"), True),
    )
    try:
        return Flags(**raw)
    except Exception:
        return Flags(agents_mode=agents_default, demo_mode=raw["demo_mode"])


flags: Flags = load_flags()


def export_env() -> None:
    """Mirror flags into os.environ so other layers (which read env) follow runtime changes."""
    os.environ["MODEL_PROVIDER"] = flags.model_provider
    os.environ["AGENTS_MODE"] = flags.agents_mode
    os.environ["VISION"] = "on" if flags.vision else "off"
    os.environ["DEVREV_MODE"] = flags.devrev_mode
    os.environ["STORAGE"] = flags.storage
    os.environ["EDGEKV_BACKEND"] = flags.edgekv_backend


def set_flags(patch: dict) -> Flags:
    global flags
    flags = Flags(**{**flags.model_dump(), **patch})
    export_env()
    return flags


export_env()
