# sesmint

**OpenCode Session Minting Proxy** — bypass free-tier quota limits by minting a fresh session ID per request.

Sits between your clients and [9router](https://github.com/serenhope/9router). Every request to an `opencode/` model gets a brand-new `ses_` ID generated with the exact algorithm from the OpenCode client source, so each request lands in its own quota pool.

## Architecture

```
Client (100 users)
    │
    ▼
┌─ sesmint :8800 ──────────────────────────────────────┐
│  • Mint fresh ses_ ID per request                    │
│  • Rotate User-Agent / client fingerprint            │
│  • Concurrency throttle (queue when saturated)       │
│  • Request jitter (smooth burst patterns)            │
│  • Auto-retry on 403/429 with exponential backoff    │
│  • Usage stats per model / status                    │
└──────────────┬───────────────────────────────────────┘
               │ forward
               ▼
┌─ 9router :20128 ─────────────────────────────────────┐
│  • API key auth                                      │
│  • Fallback chain (OpenCode → OpenRouter → NVIDIA…)  │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
         OpenCode / providers
```

## Quick Start

```bash
# No dependencies — Node 18+ built-ins only
node index.mjs
```

## Configuration

All via environment variables:

| Variable | Default | Description |
|---|---|---|
| `SESMINT_PORT` | `8800` | Listen port |
| `SESMINT_HOST` | `0.0.0.0` | Listen host |
| `SESMINT_UPSTREAM` | `http://127.0.0.1:20128` | 9router base URL |
| `SESMINT_MAX_CONCURRENT` | `40` | Max parallel upstream requests |
| `SESMINT_ROTATE_MODELS` | `opencode/` | Comma-separated model prefixes to rotate |
| `SESMINT_UA_ROTATION` | `true` | Rotate User-Agent headers |
| `SESMINT_CLIENT_ROTATION` | `true` | Rotate x-opencode-client |
| `SESMINT_JITTER_MS` | `150` | Max random delay before forwarding |
| `SESMINT_MAX_RETRIES` | `3` | Retries on 403/429 |
| `SESMINT_RETRY_DELAY` | `500` | Base retry delay (exponential) |
| `SESMINT_VERBOSE` | `false` | Verbose logging |

## Endpoints

| Path | Description |
|---|---|
| `/v1/chat/completions` | OpenAI-compatible proxy (all methods forwarded) |
| `/health` | Health check + throttle stats |
| `/stats` | Usage metrics (requests, rotations, retries, by-model) |

## Anti-Detection Layers

1. **Session minting** — Fresh `ses_` ID per request using the exact OpenCode algorithm (timestamp-derived prefix + random suffix). Random hex gets 403; this doesn't.

2. **Fingerprint rotation** — User-Agent, client type, and project ID rotate from a pool of real values captured from actual OpenCode CLI traffic.

3. **Concurrency throttle** — Caps parallel upstream requests (default 40). Excess requests queue instead of bursting, avoiding burst-detection 403s.

4. **Request jitter** — Small random delay (0–150ms) before forwarding smooths timing patterns.

5. **Retry with backoff** — On 403/429, mints a new session, waits exponential backoff (500ms → 1s → 2s + jitter), and retries up to 3 times.

6. **Header passthrough** — Preserves downstream headers when present; only fills gaps with rotated values.

## Tested Capacity

| Metric | Result |
|---|---|
| 100 parallel unique sessions | 100/100 (6.8s) |
| 1 session × 50 requests | 50/50 (no per-session limit found) |
| Burst detection threshold | ~150 rapid requests → temporary 403, recovers in ~60s |
| Per-IP cap | None detected |

## Project Structure

```
sesmint/
├── package.json
├── index.mjs           Entry point
├── README.md
└── src/
    ├── config.mjs         Env-based configuration
    ├── sessionMinter.mjs  OpenCode session ID algorithm
    ├── fingerprint.mjs    UA/client rotation pool
    ├── throttle.mjs       Concurrency limiter + jitter
    ├── stats.mjs          Usage tracking
    └── proxy.mjs          Core proxy + retry engine
```

## PM2 Deployment

```bash
pm2 start index.mjs --name sesmint
pm2 save
```

## Docker (optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 8800
CMD ["node", "index.mjs"]
```

## Usage Example

```bash
# Point your client at sesmint instead of 9router directly
curl http://127.0.0.1:8800/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_9ROUTER_KEY" \
  -d '{
    "model": "opencode/mimo-v2.6-flash-free",
    "messages": [{"role": "user", "content": "hi"}],
    "stream": false
  }'
```

Every request gets a fresh session → fresh quota → no rate limit.
