"""Checks the Akamai hosted chat key works: one chat_json call. Run from code/: .venv/Scripts/python scripts/smoke_akamai.py"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.integrations import ai  # noqa: E402


async def main() -> None:
    if not os.getenv("AKAMAI_AI_KEY"):
        print("FAIL: AKAMAI_AI_KEY is not set (put it in code/.env). The app still runs on fallbacks.")
        return
    out = await ai.chat_json("You are a helpful assistant.", 'Return {"ok": true, "word": "pothole"}', 100)
    print("OK:" if out else "FAIL: no usable response (bad key, rate limit, timeout or network).", out or "")


asyncio.run(main())
