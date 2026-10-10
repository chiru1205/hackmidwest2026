"""Photo triage with a vision model through Strands (VISION=on only). Returns None on any failure."""
from __future__ import annotations

import logging
import os
import time

from contracts.models import Triage
from backend.integrations.ai import usage

log = logging.getLogger("civicflow.vision")
PROMPT = ("You triage citizen photos of city infrastructure problems. Decide if the photo shows a real "
          "infrastructure issue, its category, a severity 1-5, whether it is a safety hazard, and a short "
          "hazard description.")


def vision_on() -> bool:
    return os.getenv("VISION", "off").lower() in ("on", "1", "true")


_model_cache: tuple | None = None
MAX_SIDE = 1024


def _shrink(image: bytes) -> bytes:
    """Downscale big phone photos (smaller upload, faster model). Falls back to the original bytes."""
    try:
        import io

        from PIL import Image, ImageOps
        im = Image.open(io.BytesIO(image))
        if max(im.size) <= MAX_SIDE and (im.format or "").upper() == "JPEG":
            return image
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82)
        return buf.getvalue()
    except Exception:
        return image


def build_vision_model():
    """Cached (the boto client is slow to create). Bedrock if AWS credentials exist, else Anthropic if a key exists, else None."""
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
    t0 = time.perf_counter()
    ok = False
    try:
        global _model_cache
        if _model_cache is None or _model_cache[0] is None:
            _model_cache = build_vision_model()
        model, provider = _model_cache
        if model is None:
            return None, ""
        image = _shrink(image)
        from strands import Agent
        agent = Agent(model=model, system_prompt=PROMPT, callback_handler=None)
        content = [{"text": f"Citizen note: {note or '(none)'}. Category chosen by citizen: {category_hint or 'unknown'}."},
                   {"image": {"format": "jpeg", "source": {"bytes": image}}}]
        res = await agent.invoke_async(content, structured_output_model=Triage)
        ok = res.structured_output is not None
        tokens = None
        try:
            tokens = int(res.metrics.accumulated_usage.get("totalTokens") or 0) or None
        except Exception:
            pass
        usage.record("vision", ok, (time.perf_counter() - t0) * 1000, tokens)
        return res.structured_output, provider
    except Exception as e:
        log.warning("vision triage failed: %s", type(e).__name__)
        usage.record("vision", False, (time.perf_counter() - t0) * 1000)
        return None, ""


def warm() -> None:
    """Pre-import strands and build the Bedrock client in a background thread so the first photo is not cold."""
    if not vision_on():
        return

    def _go() -> None:
        global _model_cache
        try:
            import strands  # noqa: F401
            from strands import Agent  # noqa: F401
            if _model_cache is None:
                _model_cache = build_vision_model()
        except Exception as e:
            log.warning("vision warm-up failed: %s", type(e).__name__)

    import threading
    threading.Thread(target=_go, daemon=True).start()
