# Paralax Architecture Migration Plan: Python/AWS to Node.js/Vercel

This migration plan outlines the complete architectural transition of the Paralax IoT Voice Translator backend from Python/AWS (AWS SAM, Lambda, DynamoDB, S3, Cognito, Step Functions) to a unified **Node.js (TypeScript) + Hono + Vercel Functions** architecture deployed alongside the React dashboard as a single project on the **Vercel Hobby (Free) plan**.

---

## 1. Executive Summary & Constraints

* **Platform**: Single Vercel deployment at repository root containing both `/frontend` (Vite + React) and `/api` (Vercel Functions + Hono).
* **Cost**: $0.00 / month across all services. No paid tiers or credit card requirements.
* **Storage**:
  * **Hot State**: Upstash Redis (Serverless REST API) via `@upstash/redis` for settings, devices, device keys, rate limiting, quotas, idempotency, and command queues.
  * **Cold History**: Neon Postgres via Drizzle ORM (`@neondatabase/serverless` + `drizzle-orm`) for historical jobs and conversation turns.
  * **Audio Persistence**: Vercel Blob (active only when `store_audio=true`, served through authenticated routes).
* **AI Provider Hierarchy**:
  * **STT**: Groq Whisper (`whisper-large-v3-turbo`) -> (optional fallback: xAI Grok STT).
  * **Translation**: Groq LLaMA (`llama-3.3-70b-versatile`) -> (optional fallback: xAI Grok Chat).
  * **TTS**: Microsoft Edge TTS (`msedge-tts` streaming native 16 kHz 16-bit mono PCM) -> (optional fallback: xAI Grok TTS).
  * **Guardrail**: `ALLOW_PAID_FALLBACK=false` ensures zero cost by default.
* **Auth**: Replaces AWS Cognito with an httpOnly, Secure, SameSite=Lax JWT cookie (`jose` HS256, 12h) validated against `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (`bcryptjs`).

---

## 2. API Route Inventory & Mapping

| Route | Method | Python / AWS Implementation | Node.js (Hono / Vercel) Equivalent | Auth & Validation |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/device/translate` | `POST` | `src/handlers/translate_utterance.py` | `POST /api/v1/device/translate` | Header `X-Device-Key`, `Idempotency-Key`, 4MB body |
| `/v1/device/heartbeat` | `POST` | `src/handlers/device_heartbeat.py` | `POST /api/v1/device/heartbeat` | Header `X-Device-Key`, Zod schema |
| `/v1/device/config` | `GET` | `src/handlers/device_config.py` | `GET /api/v1/device/config` | Header `X-Device-Key` |
| `/v1/device/commands/:id/ack` | `POST` | `src/handlers/device_commands.py` | `POST /api/v1/device/commands/:id/ack` | Header `X-Device-Key`, `{ status, detail }` |
| `/v1/utterances` | `POST` | `src/handlers/translate_utterance.py` | `POST /api/v1/utterances` | Machine API Key (`x-api-key`) or Admin Cookie, multipart/raw |
| `/v1/languages` | `GET` | `src/handlers/jobs.py` | `GET /api/v1/languages` | Public / Cacheable |
| `/v1/auth/login` | `POST` | *None (Used AWS Cognito)* | `POST /api/v1/auth/login` | `{ email, password }`, Rate-limited by IP, sets JWT cookie |
| `/v1/auth/logout` | `POST` | *None (Used AWS Cognito)* | `POST /api/v1/auth/logout` | Clears auth cookie |
| `/v1/auth/me` | `GET` | *None (Used AWS Cognito)* | `GET /api/v1/auth/me` | Validates JWT cookie, returns `{ email, role }` |
| `/v1/admin/devices` | `GET` | `src/handlers/admin_devices.py` | `GET /api/v1/admin/devices` | Admin JWT Cookie |
| `/v1/admin/devices` | `POST` | `src/handlers/admin_devices.py` | `POST /api/v1/admin/devices` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/devices/:id` | `GET` | `src/handlers/admin_devices.py` | `GET /api/v1/admin/devices/:id` | Admin JWT Cookie |
| `/v1/admin/devices/:id/config` | `PUT` | `src/handlers/admin_devices.py` | `PUT /api/v1/admin/devices/:id/config` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/devices/:id/rotate-key` | `POST` | `src/handlers/admin_devices.py` | `POST /api/v1/admin/devices/:id/rotate-key` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/devices/:id/revoke` | `POST` | `src/handlers/admin_devices.py` | `POST /api/v1/admin/devices/:id/revoke` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/devices/:id` | `DELETE` | `src/handlers/admin_devices.py` | `DELETE /api/v1/admin/devices/:id` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/devices/:id/commands` | `POST` | `src/handlers/admin_devices.py` | `POST /api/v1/admin/devices/:id/commands` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/devices/:id/commands` | `GET` | `src/handlers/admin_devices.py` | `GET /api/v1/admin/devices/:id/commands` | Admin JWT Cookie |
| `/v1/admin/devices/:id/telemetry`| `GET` | `src/handlers/admin_devices.py` | `GET /api/v1/admin/devices/:id/telemetry`| Admin JWT Cookie |
| `/v1/admin/conversations` | `GET` | `src/handlers/admin_conversations.py` | `GET /api/v1/admin/conversations` | Admin JWT Cookie |
| `/v1/admin/conversations/:id` | `GET` | `src/handlers/admin_conversations.py` | `GET /api/v1/admin/conversations/:id` | Admin JWT Cookie |
| `/v1/admin/jobs` | `GET` | `src/handlers/jobs.py` | `GET /api/v1/admin/jobs` | Admin JWT Cookie |
| `/v1/jobs/:job_id` | `GET` | `src/handlers/jobs.py` | `GET /api/v1/jobs/:job_id` | Admin JWT Cookie or Machine API Key |
| `/v1/admin/jobs/:id/retry` | `POST` | `src/handlers/jobs.py` | `POST /api/v1/admin/jobs/:id/retry` | Admin JWT Cookie (allowed only if `can_retry: true`) |
| `/v1/admin/jobs/:id` | `DELETE` | `src/handlers/jobs.py` | `DELETE /api/v1/admin/jobs/:id` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/jobs/:id/audio/:kind` | `GET` | *None (Used S3 Presigned URLs)* | `GET /api/v1/admin/jobs/:id/audio/:kind` | Admin JWT Cookie, streams Vercel Blob |
| `/v1/admin/settings` | `GET` | `src/handlers/admin_settings.py` | `GET /api/v1/admin/settings` | Admin JWT Cookie (includes `providers` block) |
| `/v1/admin/settings` | `PUT` | `src/handlers/admin_settings.py` | `PUT /api/v1/admin/settings` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/stats` | `GET` | `src/handlers/admin_stats.py` | `GET /api/v1/admin/stats` | Admin JWT Cookie, SQL percentiles |
| `/v1/admin/health` | `GET` | `src/handlers/admin_health.py` | `GET /api/v1/admin/health` | Admin JWT Cookie, cached 30s |
| `/v1/admin/api-keys` | `GET` | `src/handlers/admin_api_keys.py` | `GET /api/v1/admin/api-keys` | Admin JWT Cookie |
| `/v1/admin/api-keys` | `POST` | `src/handlers/admin_api_keys.py` | `POST /api/v1/admin/api-keys` | Admin JWT Cookie + `X-Requested-With` |
| `/v1/admin/api-keys/:hash` | `DELETE` | `src/handlers/admin_api_keys.py` | `DELETE /api/v1/admin/api-keys/:hash` | Admin JWT Cookie + `X-Requested-With` |
| `/api/cron/retention` | `GET` | *None (Used DynamoDB TTL)* | `GET /api/cron/retention` | Protected by `Authorization: Bearer CRON_SECRET` |

### Removed Endpoints
* `POST /v1/uploads`: Deprecated presigned S3 upload flow.
* `POST /v1/jobs`: Deprecated batch Step Functions submit flow.
* `POST /v1/admin/jobs/:id/cancel`: In Vercel serverless functions, execution is synchronous and bounded.

---

## 3. Data Storage & Schema Mapping

### Upstash Redis (Hot State Key Layout)
* `paralax:settings` (Hash): Global system settings.
* `paralax:device:{device_id}` (Hash): Device metadata, config, versions, heartbeat info.
* `paralax:device_key:{sha256(raw_key)}` (String): Fast `device_id` lookup for device authentication.
* `paralax:commands:{device_id}` (List): Queued commands for delivery on next heartbeat.
* `paralax:command_history:{device_id}` (List): Capped history of 50 recent acknowledged commands.
* `paralax:telemetry:{device_id}` (List): Capped list of 200 telemetry samples with 3-day TTL.
* `paralax:idempotency:{device_id}:{idempotency_key}` (String/JSON): Cached response & transcript with 24h TTL.
* `paralax:rate_limit:{device_id}:{minute_timestamp}` (String/Counter): Rate limiting with 60s TTL.
* `paralax:daily_quota:{device_id}:{date_string}` (String/Counter): Daily quota tracking with 86400s TTL.
* `paralax:api_key:{sha256(raw_key)}` (Hash): Machine client API key metadata.
* `paralax:login_throttle:{client_ip}` (String/Counter): 5 attempts per 15 minutes window.
* `paralax:health_cache` (String/JSON): 30-second TTL cache for `/v1/admin/health`.

### Neon Postgres (Drizzle ORM Schema)
```typescript
export const jobs = pgTable('jobs', {
  jobId: varchar('job_id', { length: 64 }).primaryKey(),
  kind: varchar('kind', { length: 16 }).notNull().default('utterance'), // 'utterance' | 'file'
  deviceId: varchar('device_id', { length: 64 }),
  conversationId: varchar('conversation_id', { length: 64 }),
  status: varchar('status', { length: 32 }).notNull(), // 'QUEUED' | 'TRANSCRIBING' | 'TRANSLATING' | 'SYNTHESIZING' | 'COMPLETED' | 'FAILED'
  sourceLanguage: varchar('source_language', { length: 16 }).notNull(),
  detectedLanguage: varchar('detected_language', { length: 16 }),
  targetLanguage: varchar('target_language', { length: 16 }).notNull(),
  transcript: text('transcript'),
  translation: text('translation'),
  audioInputBlobPath: text('audio_input_blob_path'),
  audioOutputBlobPath: text('audio_output_blob_path'),
  canRetry: boolean('can_retry').notNull().default(false),
  durationSec: real('duration_sec'),
  transcribeMs: real('transcribe_ms'),
  translateMs: real('translate_ms'),
  synthesizeMs: real('synthesize_ms'),
  totalMs: real('total_ms'),
  errorCode: varchar('error_code', { length: 64 }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  deviceIdx: index('jobs_device_id_idx').on(table.deviceId),
  convIdx: index('jobs_conversation_id_idx').on(table.conversationId),
  statusIdx: index('jobs_status_idx').on(table.status),
  createdIdx: index('jobs_created_at_idx').on(table.createdAt),
}));

export const conversations = pgTable('conversations', {
  conversationId: varchar('conversation_id', { length: 64 }).primaryKey(),
  deviceId: varchar('device_id', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUtteranceAt: timestamp('last_utterance_at', { withTimezone: true }).defaultNow().notNull(),
  utteranceCount: integer('utterance_count').notNull().default(1),
}, (table) => ({
  deviceIdx: index('conv_device_id_idx').on(table.deviceId),
  lastUtteranceIdx: index('conv_last_utterance_idx').on(table.lastUtteranceAt),
}));
```

---

## 4. Settings Inventory & Transition

| Key | Type | Default Value | Notes |
| :--- | :--- | :--- | :--- |
| `service_enabled` | Boolean | `true` | When `false`, user translation returns 503 `service_disabled` |
| `max_utterance_sec` | Integer | `15` | Audio capture duration cap (maximum allowable: 20) |
| `max_file_size_mb` | Integer | `4` | File ingestion cap (must stay <= 4.5 MB Vercel limit) |
| `retention_days` | Integer | `30` | Auto-purged by daily cron |
| `store_audio` | Boolean | `false` | When `false`, audio is returned directly without blob storage |
| `language_id_min_confidence` | Float | `0.65` | Rejection threshold for ambiguous auto-detect speech |
| `conversation_idle_sec` | Integer | `180` | Idleness gap before starting a new `conversation_id` |
| `device_rate_limit_per_min` | Integer | `20` | Aligned with Groq Whisper free tier limit (20 RPM) |
| `device_daily_quota` | Integer | `500` | Device quota comfortably below Groq daily cap (2,000 RPD) |
| `default_heartbeat_interval_sec` | Integer | `30` | Device polling frequency |
| `allowed_languages` | Array | `["en-US", "es-US", "fr-FR", ...]` | Valid language codes |
| `voice_map` | Object | `{}` | Custom voice overrides |
| `providers` *(Read-Only)* | Object | Computed at runtime | Shows active STT, Translate, TTS chains and `allow_paid_fallback` |

---

## 5. Error Code Reference & Compatibility

| Error Code | HTTP Status | Response Schema | Description |
| :--- | :--- | :--- | :--- |
| `unsupported_language_pair` | 422 | `ErrorResponse` | Language pair lacks STT or TTS voice support |
| `no_speech_detected` | 422 | `ErrorResponse` | RMS silence or Whisper `no_speech_prob > 0.8` |
| `low_confidence_language` | 422 | `ErrorResponse` | Identified language outside device pair or confidence < threshold |
| `audio_too_long` | 422 | `ErrorResponse` | Audio duration exceeds `max_utterance_sec` |
| `invalid_audio_format` | 422 | `ErrorResponse` | Audio corrupted or wrong sample rate/channels |
| `rate_limited` | 429 | `ErrorResponse` + `retry_after_sec` | Device exceeded requests per minute |
| `quota_exceeded` | 429 | `ErrorResponse` + `retry_after_sec` | Device exceeded daily quota |
| `provider_rate_limited` | 429 | `ErrorResponse` + `retry_after_sec` | Upstream AI providers all returned 429 |
| `service_disabled` | 503 | `ErrorResponse` | Administrator paused translation service |
| `in_progress` | 409 | `ErrorResponse` | Idempotent request currently executing |
| `unauthorized` | 401 | `ErrorResponse` | Invalid or missing admin cookie or device key |
| `not_found` | 404 | `ErrorResponse` | Device, conversation, or job not found |
| `cannot_retry` | 400 | `ErrorResponse` | Retry requested but input audio was not stored |

---

## 6. Implementation Sequence

1. **Step 0**: Safety Tag & Ground Rules (`git tag pre-node-migration`, switch to `migrate-node`, inspect secrets).
2. **Step 1**: Hosting layout (root `package.json`, `tsconfig.json`, `vercel.json` with SPA rewrite and cron, Vite proxy in `frontend/vite.config.ts`).
3. **Step 2**: Provider Abstraction Layer (`api/providers/` for STT, Translator, TTS with Groq, Edge, xAI adapters, and Pure-JS audio decoding).
4. **Step 3**: Database & Hot State Layer (`api/db/` with Upstash Redis client and Neon Postgres + Drizzle ORM schema and migrations).
5. **Step 4**: Authentication Layer (`api/middleware/auth.ts`, password hashing script, JWT cookies, constant-time device key verification).
6. **Step 5**: Single Synchronous Translation Pipeline (`api/routes/translate.ts`, `api/routes/utterances.ts`, audio validation, waitUntil persistence).
7. **Step 6**: Complete Route Implementation (`/api/v1/*` Hono routes matching all admin and device requirements, openapi schema generation).
8. **Step 7**: Frontend Client Updates (remove Cognito, switch to cookie JWT, implement single-request file uploads, update types).
9. **Step 8**: Testing & Validation (Vitest test suite with MSW mocks, contract tests, `tools/device-sim.mjs` Node script).
10. **Step 9**: Python/AWS Deletion (in a dedicated separate commit, remove Python server, SAM templates, and AWS workflows).
