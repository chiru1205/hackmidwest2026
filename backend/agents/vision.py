"""Photo triage with a vision model through Strands (VISION=on only). Returns None on any failure."""
from __future__ import annotations

import logging
import os

from contracts.models import Triage

log = logging.getLogger("civicflow.vision")
PROMPT = ("You triage citizen photos of city infrastructure problems. Decide if the photo shows a real "
          "infrastructure issue, its category, a severity 1-5, whether it is a safety hazard, and a short "
          "hazard description.")


def vision_on() -> bool:
    return os.getenv("VISION", "off").lower() in ("on", "1", "true")


def build_vision_model():
    """Bedrock if AWS credentials exist, else Anthropic if a key exists, else None."""
    if os.getenv("AWS_BEARER_TOKEN_BEDROCK") or os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_PROFILE"):
        from strands.models import BedrockModel
        return BedrockModel(model_id=os.getenv("BEDROCK_HAIKU_ID") or "us.anthropic.claude-haiku-5-5",
                            region_name=os.getenv("AWS_REGION") or "us-west-2"), "bedrock"
    if os.getenv("ANTHROPIC_API_KEY"):
        from strands.models.anthropic import AnthropicModel
        return AnthropicModel(client_args={"api_key": os.getenv("ANTHROPIC_API_KEY")},
                              model_id=os.getenv("ANTHROPIC_HAIKU_ID") or "claude-haiku-5-5", max_tokens=600), "anthropic"
    return None, ""


async def triage_photo(image: bytes, note: str, category_hint: str | None) -> tuple[Triage | None, str]:
    try:
        model, provider = build_vision_model()
        if model is None:
            return None, ""
        from strands import Agent
        agent = Agent(model=model, system_prompt=PROMPT, callback_handler=None)
        content = [{"text": f"Citizen note: {note or '(none)'}. Category chosen by citizen: {category_hint or 'unknown'}."},
                   {"image": {"format": "jpeg", "source": {"bytes": image}}}]
        res = await agent.invoke_async(content, structured_output_model=Triage)
        return res.structured_output, provider
    except Exception as e:
        log.warning("vision triage failed: %s", type(e).__name__)
        return None, ""
