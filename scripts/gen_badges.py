"""Generate badge medallion art with Akamai's hosted image model.

Usage: python scripts/gen_badges.py [--force] [--only id1,id2] [--variant 2]
Reads AKAMAI_AI_BASE_URL / AKAMAI_AI_KEY from .env (never printed).
Paced at >= 12 s between calls (6 images/min limit). Saves frontend/public/badges/<id>.png.
"""
from __future__ import annotations

import argparse
import base64
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "badges"
PACE_S = 12.5

STYLE = (
    "flat vector illustration of a single round medallion badge, centered, solid signal blue (#2457FF) "
    "and dark ink navy (#0B1B33) with a small gold accent, thick bold simple symbol in the middle, "
    "clean geometric shapes, soft drop shadow, plain light off-white background, "
    "no text, no letters, no numbers, no words"
)
SYMBOLS = {
    "first_report": "a camera with a small spark above it",
    "good_neighbor": "two friendly figures standing side by side with a small house",
    "fixer": "a hard hat crossed with a wrench",
    "streak": "a flame with three small ascending bars",
    "eagle_eye": "a bold eagle head in profile with a sharp gold eye",
    "watcher": "a large open eye",
    "guardian": "a shield with a star",
}
ALT = {  # adjusted prompts for a second attempt (--variant 2)
    k: v + ", extremely simple icon, no writing of any kind, symmetrical" for k, v in SYMBOLS.items()
}


def generate(client: httpx.Client, base: str, key: str, prompt: str) -> bytes:
    for attempt in (1, 2):
        r = client.post(
            f"{base}/images/generations",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": "hackathon-image", "prompt": prompt, "n": 1, "size": "512x512", "response_format": "b64_json"},
            timeout=120,
        )
        if r.status_code == 429 or r.status_code >= 500:
            if attempt == 1:
                print(f"  HTTP {r.status_code}, waiting 30 s and retrying once")
                time.sleep(30)
                continue
        r.raise_for_status()
        return base64.b64decode(r.json()["data"][0]["b64_json"])
    raise RuntimeError("unreachable")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--variant", type=int, default=1)
    a = ap.parse_args()
    load_dotenv(ROOT / ".env")
    base = os.environ.get("AKAMAI_AI_BASE_URL", "").rstrip("/")
    key = os.environ.get("AKAMAI_AI_KEY", "")
    if not base or not key:
        print("AKAMAI_AI_BASE_URL / AKAMAI_AI_KEY missing in .env")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    only = {s for s in a.only.split(",") if s}
    symbols = ALT if a.variant == 2 else SYMBOLS
    first = True
    with httpx.Client() as client:
        for bid, sym in symbols.items():
            if only and bid not in only:
                continue
            path = OUT / f"{bid}.png"
            if path.exists() and not a.force:
                print(f"skip {bid} (exists)")
                continue
            if not first:
                time.sleep(PACE_S)
            first = False
            print(f"generating {bid} ...")
            try:
                path.write_bytes(generate(client, base, key, f"{STYLE}. The symbol: {sym}."))
                print(f"  saved {path.name}")
            except Exception as e:  # never echo request headers
                print(f"  failed {bid}: {type(e).__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
