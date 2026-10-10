# backend/agents/ — AWS Strands Agents
**Owner: P2** · P1 pairs at 1:00 for the Strands and Akamai smoke tests.

- `intake.py`: standalone agent; Bedrock Claude Haiku 5.5 reads the photo (structured output)
- `graph.py`: `dedup_judge? → priority → dispatch`, built per request
- `hooks.py`: BeforeToolCall guard, AfterToolCall audit
- `tools.py`, `prompts.py`
- `det.py`: plain-Python fallback (`AGENTS_MODE=det`) that emits the same events

**Rules**
- Always `await agent.invoke_async(...)`, never a sync call inside `async def`.
- Akamai-backed nodes use strict-JSON prompts with `max_tokens`; do NOT set `structured_output_model` on them.
- Dispatch creates the ticket in plain Python; the LLM only writes the title and body.
