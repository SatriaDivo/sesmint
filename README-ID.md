# sesmint

**OpenCode Session Minting Proxy** — bypass batas kuota free-tier dengan generate session ID baru setiap request.

Berada di antara client dan [9router](https://github.com/serenhope/9router). Setiap request ke model `opencode/` dapat `ses_` ID baru yang di-generate pakai algorithm persis dari source OpenCode client, jadi setiap request masuk ke quota pool-nya sendiri.

## Arsitektur

```
Client
    │
    ▼
┌─ sesmint :8800 ──────────────────────────────────────┐
│  • Mint ses_ ID baru per request                     │
│  • Rotasi User-Agent / fingerprint client            │
│  • Concurrency throttle (antrean saat penuh)         │
│  • Request jitter (haluskan pola burst)              │
│  • Auto-retry 403/429 dengan exponential backoff     │
│  • Statistik usage per model / status                │
└──────────────┬───────────────────────────────────────┘
               │ forward
               ▼
┌─ 9router :20128 ─────────────────────────────────────┐
│  • Auth API key                                      │
│  • Fallback chain (OpenCode → OpenRouter → NVIDIA…)  │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
         OpenCode / providers
```

## Quick Start

```bash
# Tanpa dependency — cukup Node 18+ built-in
node index.mjs
```

## Konfigurasi

Semua via environment variable:

| Variable | Default | Keterangan |
|---|---|---|
| `SESMINT_PORT` | `8800` | Port listen |
| `SESMINT_HOST` | `0.0.0.0` | Host listen |
| `SESMINT_UPSTREAM` | `http://127.0.0.1:20128` | URL base 9router |
| `SESMINT_MAX_CONCURRENT` | `40` | Maksimal request paralel ke upstream |
| `SESMINT_ROTATE_MODELS` | `opencode/` | Prefix model yang di-rotate (pisah koma) |
| `SESMINT_UA_ROTATION` | `true` | Rotasi header User-Agent |
| `SESMINT_CLIENT_ROTATION` | `true` | Rotasi x-opencode-client |
| `SESMINT_JITTER_MS` | `150` | Delay random maksimum sebelum forward |
| `SESMINT_MAX_RETRIES` | `3` | Jumlah retry saat 403/429 |
| `SESMINT_RETRY_DELAY` | `500` | Delay dasar retry (eksponensial) |
| `SESMINT_VERBOSE` | `false` | Logging detail |

## Endpoints

| Path | Keterangan |
|---|---|
| `/v1/chat/completions` | Proxy OpenAI-compatible (semua method di-forward) |
| `/health` | Health check + statistik throttle |
| `/stats` | Metrik usage (request, rotasi, retry, per-model) |

## Lapisan Anti-Deteksi

1. **Session minting** — `ses_` ID baru setiap request pakai algorithm OpenCode asli (prefix timestamp-derived + suffix random). Hex random dapat 403; ini tidak.

2. **Rotasi fingerprint** — User-Agent, tipe client, dan project ID dirotasi dari pool nilai asli yang di-capture dari traffic OpenCode CLI.

3. **Concurrency throttle** — Batasi request paralel ke upstream (default 40). Request kelebihan masuk antrean, bukan burst, hindari deteksi 403.

4. **Request jitter** — Delay random kecil (0–150ms) sebelum forward untuk menghaluskan pola timing.

5. **Retry dengan backoff** — Saat 403/429, mint session baru, tunggu exponential backoff (500ms → 1s → 2s + jitter), retry sampai 3 kali.

6. **Header passthrough** — Pertahankan header dari downstream kalau ada; hanya isi yang kosong dengan nilai rotasi.

## Kapasitas Teruji

| Metrik | Hasil |
|---|---|
| 100 paralel unique session | 100/100 (6.8 detik) |
| 1 session × 50 request | 50/50 (tidak ada limit per-session) |
| Ambang deteksi burst | ~150 request rapid → 403 sementara, pulih ~60 detik |
| Batas per-IP | Tidak terdeteksi |

## Struktur Project

```
sesmint/
├── package.json
├── index.mjs              Entry point
├── README.md
├── README-ID.md
└── src/
    ├── config.mjs         Konfigurasi via env
    ├── sessionMinter.mjs  Algorithm session ID OpenCode
    ├── fingerprint.mjs    Pool rotasi UA/client
    ├── throttle.mjs       Concurrency limiter + jitter
    ├── stats.mjs          Tracking usage
    └── proxy.mjs          Core proxy + retry engine
```

## Deploy PM2

```bash
pm2 start index.mjs --name sesmint
pm2 save
```

## Docker (opsional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 8800
CMD ["node", "index.mjs"]
```

## Contoh Pakai

```bash
# Arahkan client ke sesmint, bukan langsung ke 9router
curl http://127.0.0.1:8800/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer KUNCI_9ROUTER_LO" \
  -d '{
    "model": "opencode/mimo-v2.6-flash-free",
    "messages": [{"role": "user", "content": "hi"}],
    "stream": false
  }'
```

Setiap request dapat session baru → kuota baru → tanpa rate limit.
