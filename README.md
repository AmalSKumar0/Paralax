# Paralax - IoT Two-Way Voice Translator (Node.js & React on Vercel)

A low-latency, serverless IoT two-way voice translator system deployed as **one single Vercel project** on the free Hobby plan. Connects an ESP32 hardware device (INMP441 I2S microphone, MAX98357A I2S amplifier, push-to-talk button) to modern free-first AI providers with an interactive React admin dashboard.

> [!NOTE]
> **Migration Note**: The backend was migrated from Python 3.12 / AWS SAM (Lambda, DynamoDB, S3, Cognito) to Node.js (TypeScript) + Hono on Vercel Functions. The original Python AWS implementation is preserved in git tag `pre-node-migration`. Streaming translation is out of scope on serverless Vercel Functions (would require a persistent WebSocket host).

---

## 1. System Architecture

```mermaid
flowchart TD
    subgraph ClientLayer[Clients]
        ESP32[ESP32-WROOM-32 Hardware<br/>INMP441 Mic + MAX98357A Amp]
        ReactUI[React 19 Admin Dashboard<br/>Vite + TailwindCSS]
        Sim[tools/device-sim.mjs<br/>Node.js Device Simulator]
    end

    subgraph VercelEdge[Vercel Serverless Hosting]
        Router[Vercel Function: api/index.ts<br/>Hono + Zod Validation]
        SPA[Vite Static Frontend SPA<br/>/frontend/dist]
        Cron[Daily Retention Cron<br/>0 0 * * *]
    end

    subgraph ProviderLayer[AI Fallback Chains (Free-First)]
        Groq[Groq Cloud<br/>Whisper-large-v3-turbo & Llama 3.3]
        EdgeTTS[Microsoft Edge ReadAloud<br/>Free Native PCM Resampling]
        xAI[xAI Grok<br/>Fallback STT / Chat / TTS]
    end

    subgraph DataLayer[Cloud Persistence (Vercel Marketplace)]
        Upstash[(Upstash Redis<br/>Hot State, Quotas, Rate Limits)]
        Neon[(Neon Postgres<br/>Drizzle ORM: Jobs & Conversations)]
        Blob[(Vercel Blob<br/>Optional Audio Storage)]
    end

    ESP32 -->|POST /api/v1/device/translate<br/>Single HTTPS Round-Trip (PCM/WAV)| Router
    ESP32 -->|POST /api/v1/device/heartbeat| Router
    ReactUI -->|/api/v1/admin/* & /api/v1/utterances| Router
    Sim -->|Heartbeat & Translate| Router

    Router --> Groq
    Router -.->|Fallback if 429| xAI
    Router --> EdgeTTS
    Router --> Upstash
    Router --> Neon
    Router --> Blob
    Cron -->|CRON_SECRET| Router
```

---

## 2. Key Features

- **Single Vercel Project**: Frontend (`/frontend`) and backend (`/api`) deploy and run together under one domain.
- **Zero Cost Free-Tier Guarantee**: `ALLOW_PAID_FALLBACK=false` ensures only 100% free providers are invoked ($0.00 / month).
- **Single HTTPS Round-Trip for Hardware**: ESP32 posts 16 kHz 16-bit mono PCM/WAV with `Accept: application/octet-stream` and receives raw playable PCM audio bytes directly with metadata in `X-*` headers.
- **Pure WASM Audio Decoding**: Pure JavaScript/WASM decoding (`mpg123-decoder`) with linear float32 resampling. **No ffmpeg binary required**.
- **Dual-Mode Persistence**: Automatically connects to Upstash Redis and Neon Postgres in production; transparently falls back to in-memory stores for zero-config offline local development and automated testing.
- **Idempotency & Resiliency**: Required `Idempotency-Key` header on device translation. Duplicate submissions return cached transcript and translation, re-synthesizing only TTS.
- **Robust Auth**: Removed Cognito. Admin uses httpOnly SameSite=Lax JWT cookies (`jose`, HS256) and CSRF protection (`X-Requested-With`). Devices authenticate via `X-Device-Key` with constant-time SHA-256 verification.

---

## 3. Free-Tier Budget & Quotas

All services run permanently on free tiers with no credit card required:

| Service | Free Tier Allocation | Paralax Usage | Safety Margin |
| :--- | :--- | :--- | :--- |
| **Vercel Hobby** | 100 GB-hrs function execution, 100k requests/day | ~1.5k requests/day | >98% free headroom |
| **Upstash Redis** | 10,000 commands/day | ~3,000 commands/day | 70% headroom |
| **Neon Postgres** | 0.5 GB storage, serverless compute | ~10 MB / month (30-day retention) | 98% headroom |
| **Groq STT** | 20 requests/minute, 2,000 requests/day | Default rate limit: 10 req/min/device | Stays below org limit |
| **Microsoft Edge TTS** | Unlimited free ReadAloud requests | Unofficial native WebSocket stream | $0.00 |

For complete calculations, see [docs/free-tier-budget.md](docs/free-tier-budget.md).

---

## 4. Local Development Setup

### Prerequisites
- Node.js >= 20.10.0
- npm >= 10.0.0

### Installation
```bash
# Clone and checkout migration branch
git clone https://github.com/AmalSKumar0/Paralax.git
cd Paralax
git checkout migrate-node

# Install all dependencies (root and frontend)
npm install
cd frontend && npm install && cd ..
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Generate a secure admin password hash:
```bash
npm run hash-password -- "YourStrongPassword123"
```
Paste the printed hash into `ADMIN_PASSWORD_HASH` in `.env`.

### Running Locally
```bash
# Option A: Run via Vercel CLI (matches production routing)
npm i -g vercel
vercel dev

# Option B: Run API tests & dev server directly
npm run dev
```

The frontend dashboard will be available at `http://localhost:3000`.

---

## 5. Deployment to Vercel

### Step 1: Push to GitHub & Link to Vercel
```bash
vercel link
```

### Step 2: Add Marketplace Integrations
From the Vercel Dashboard Marketplace, add:
1. **Upstash Redis** (creates `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`)
2. **Neon Postgres** (creates `DATABASE_URL`)

### Step 3: Configure Environment Variables
Add remaining variables using the Vercel CLI:
```bash
vercel env add ADMIN_EMAIL production
# Enter: admin@paralax.io

vercel env add ADMIN_PASSWORD_HASH production
# Enter the bcrypt hash from npm run hash-password

vercel env add JWT_SECRET production
# Enter a 32+ character random string

vercel env add CRON_SECRET production
# Enter a secure random token for cron retention

vercel env add GROQ_API_KEY production
# Enter your free key from https://console.groq.com
```

### Step 4: Deploy
```bash
vercel --prod
```

---

## 6. Device Simulator & CLI Examples

### 1. Provision a New Device
Log in to the dashboard at `/devices` or register via curl:
```bash
curl -X POST https://your-paralax-app.vercel.app/api/v1/admin/devices \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lobby ESP32 Translator",
    "config": {
      "language_a": "en-US",
      "language_b": "es-ES",
      "mode": "buttons"
    }
  }'
```
Save the returned `device_key` (displayed only once).

### 2. Run the Node.js Device Simulator
The device simulator performs the full hardware lifecycle:
```bash
node tools/device-sim.mjs \
  --api-url "https://your-paralax-app.vercel.app/api/v1" \
  --device-key "px_dev_sec_your_key_here" \
  --source "en-US" \
  --target "es-ES" \
  --out "output_translated.wav"
```
The simulator sends simulated 16 kHz PCM audio, receives the binary response, and writes a playable WAV file `output_translated.wav`.

### 3. Direct Translation via curl
```bash
curl -X POST "https://your-paralax-app.vercel.app/api/v1/device/translate?source=en-US&target=es-ES&format=pcm" \
  -H "X-Device-Key: px_dev_sec_your_key_here" \
  -H "Content-Type: audio/L16;rate=16000" \
  -H "Accept: application/octet-stream" \
  -H "Idempotency-Key: $(uuidgen)" \
  --data-binary @sample_speech_16k.pcm \
  --output translated.pcm
```

---

## 7. Known Limits & Architecture Constraints

- **4.5 MB Request/Response Cap**: Vercel Serverless Functions limit payload sizes to 4.5 MB. Audio utterances are capped at 20 seconds (< 700 KB). File uploads in the Test Console enforce a 4 MB client-side check.
- **No Inbound WebSockets on Vercel Functions**: Vercel does not support persistent WebSocket connections. Device audio is handled through low-overhead synchronous HTTPS POST requests. Streaming translation is out of scope.
- **Microsoft Edge TTS**: Edge TTS uses Microsoft's ReadAloud WebSocket API. While 100% free and high quality, it is an unofficial public interface. If it ever encounters upstream disruption, set `ALLOW_PAID_FALLBACK=true` to enable xAI Grok TTS fallback.
- **Vercel Hobby License**: The Vercel Hobby plan is intended for non-commercial personal and evaluation projects.

---

## 8. Troubleshooting

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **HTTP 401 on /api/v1/device/\*** | Missing or invalid `X-Device-Key` header | Verify device key against the Admin Dashboard under `/devices`. |
| **HTTP 422 no_speech_detected** | RMS audio amplitude below silence threshold | Check microphone gain on INMP441 or ensure audio input is not silent. |
| **HTTP 422 low_confidence_language** | Spoken language is not in device's `language_a` or `language_b` | Speak in one of the configured device languages or switch mode to `buttons`. |
| **HTTP 429 provider_rate_limited** | Free-tier rate limit reached across all providers | Wait for `retry_after_sec` to expire, or configure additional fallback keys in `.env`. |
| **HTTP 403 on state-changing Admin routes** | Missing `X-Requested-With` header | Include `X-Requested-With: XMLHttpRequest` on POST/PUT/DELETE admin requests. |
| **CORS Errors in Local Dev** | Frontend trying to connect directly to different port | Use `/api` proxy or run through `vercel dev`. |

---

## 9. Development Scripts

```bash
npm test            # Run Vitest test suite with MSW mocks
npm run lint        # Typecheck backend and frontend
npm run typecheck   # Typecheck backend TypeScript
npm run db:migrate  # Run Neon Postgres schema migrations
npm run hash-password -- "password"  # Hash an admin password
npm run registry:check  # Validate language registry and voices
```
