"""Checks that AWS Bedrock + Claude Haiku 5.5 work with an image. Prints OK or the reason; never prints secrets.

Run from code/:  .venv\\Scripts\\python scripts\\smoke_bedrock.py
Needs in code/.env: AWS_BEARER_TOKEN_BEDROCK (Bedrock API key) or normal AWS credentials, AWS_REGION, BEDROCK_HAIKU_ID.
"""
import io
import os
import sys

from dotenv import load_dotenv

load_dotenv()

region = os.getenv("AWS_REGION") or "us-west-2"
model_id = os.getenv("BEDROCK_HAIKU_ID") or "us.anthropic.claude-haiku-5-5"
has_token = bool(os.getenv("AWS_BEARER_TOKEN_BEDROCK"))
has_keys = bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))
print(f"region={region} model={model_id} bearer_token={'yes' if has_token else 'no'} access_keys={'yes' if has_keys else 'no'}")
if not (has_token or has_keys):
    print("FAIL: no AWS credentials. Set AWS_BEARER_TOKEN_BEDROCK (a Bedrock API key) in code/.env.")
    sys.exit(1)

from PIL import Image, ImageDraw  # noqa: E402

img = Image.new("RGB", (512, 384), (96, 98, 102))          # grey asphalt
d = ImageDraw.Draw(img)
d.ellipse((170, 140, 340, 250), fill=(20, 20, 22))          # dark pothole
d.ellipse((160, 130, 350, 262), outline=(60, 60, 64), width=6)
buf = io.BytesIO()
img.save(buf, "JPEG", quality=85)

import boto3  # noqa: E402
from botocore.exceptions import BotoCoreError, ClientError  # noqa: E402

try:
    client = boto3.client("bedrock-runtime", region_name=region)
    resp = client.converse(
        modelId=model_id,
        messages=[{"role": "user", "content": [
            {"text": "This is a test image for a city road-repair app. In one short sentence, what road defect do you see?"},
            {"image": {"format": "jpeg", "source": {"bytes": buf.getvalue()}}},
        ]}],
        inferenceConfig={"maxTokens": 120},   # no temperature: Claude 5.x rejects non-default values
    )
    text = resp["output"]["message"]["content"][0].get("text", "")
    usage = resp.get("usage", {})
    print("OK: Bedrock vision works.")
    print("model said:", text.strip()[:200])
    print("tokens in/out:", usage.get("inputTokens"), "/", usage.get("outputTokens"))
except ClientError as e:
    err = e.response.get("Error", {})
    print(f"FAIL: {err.get('Code')}: {err.get('Message')}")
    code = err.get("Code", "")
    if code in ("ResourceNotFoundException", "AccessDeniedException"):
        print("Hint: submit the Anthropic first-use form (Bedrock console > Model catalog > Claude), wait ~15 min, then retry.")
    elif code == "ValidationException":
        print("Hint: check BEDROCK_HAIKU_ID against Bedrock console > Cross-region inference.")
    elif code == "ThrottlingException":
        print("Hint: new accounts can have low quotas. Retry in a minute or use ANTHROPIC_API_KEY instead.")
    sys.exit(1)
except BotoCoreError as e:
    print("FAIL:", type(e).__name__, str(e)[:200])
    sys.exit(1)
