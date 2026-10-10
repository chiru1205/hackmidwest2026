# backend/integrations/ — everything that talks to a sponsor service
**Owner: P2** · every client has a mock or fallback switch, so nobody is blocked by an outage.

| Folder | What | Fallback flag |
|---|---|---|
| `devrev/` | mock ticket board with DevRev-shaped payloads (default); live client later | `DEVREV_MODE=mock` |
| `storage/` | Akamai Object Storage (S3 via boto3) | `STORAGE=local` |
| `ai/` | Bedrock client, Akamai hosted-inference client, 50/min token bucket | `MODEL_PROVIDER=anthropic`, `VISION=off` |

**Hand-off to P1:** plain functions `upsert_ticket(cluster)`, `poll()`, `store_photo(bytes)`.
