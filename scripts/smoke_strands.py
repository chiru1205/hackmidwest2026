"""Builds the Strands OpenAIModel agent against Akamai and runs one prompt."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.agents.common import build_akamai_agent  # noqa: E402


async def main() -> None:
    if not os.getenv("AKAMAI_AI_KEY"):
        print("FAIL: AKAMAI_AI_KEY is not set (put it in code/.env).")
        return
    try:
        agent = build_akamai_agent("Answer in one short sentence.", 100)
        res = await asyncio.wait_for(agent.invoke_async("Why do potholes form?"), timeout=30)
        print("OK:", str(res).strip())
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")


asyncio.run(main())
