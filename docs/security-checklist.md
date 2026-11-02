# Security Controls & Hardening Checklist

This document details the security posture, cryptographic controls, and threat mitigations implemented across the Paralax Node.js / Vercel architecture.

---

## 1. Authentication & Authorization Matrix

| Route Pattern | Target Consumer | Auth Mechanism | Credentials / Secret Handling | Revocation Propagation |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/device/*` | ESP32 Hardware | Device Header | Header `X-Device-Key`. Raw keys are **never stored**; only salted SHA-256 hashes (`salt:digest`) are persisted in Redis. Verified using timing-safe comparison (`crypto.timingSafeEqual`). | Immediate on device revocation or key rotation in Redis |
| `/api/v1/admin/*` | Admin Dashboard | httpOnly Cookie / JWT | Signed with HS256 using `JWT_SECRET` via `jose`. Validated on every admin request. Cookie set with `httpOnly`, `Secure` (production), `SameSite=Lax`. Requires `X-Requested-With` header on state-changing requests. | Immediate upon logout (cookie deletion) or token expiration (12h) |
| `/api/v1/utterances` | Dashboard / SDK | Admin JWT or `x-api-key` | Validated against salted SHA-256 hashes in Redis. | Immediate on key deletion |
| `/api/cron/*` | Vercel Cron | Bearer Token | Protected by `CRON_SECRET`. Verified with timing-safe string comparison. | Immediate |

---

## 2. Secrets Management & Environment Isolation

- **Zero Hardcoded Secrets**: All keys, passwords, and tokens are read exclusively from `process.env`.
- **Git Protection**: `.env`, `.env.local`, and `.vercel` are strictly excluded in `.gitignore`.
- **Frontend Leak Prevention**: No secrets are prefixed with `VITE_`. Frontend bundles contain zero cloud or provider credentials.
- **Bcrypt Password Storage**: Admin password is never stored in plaintext; compared using `bcryptjs` with configurable salt rounds.

---

## 3. Cryptography & Data Protection

- **Data in Transit**:
  - Enforced over TLS 1.2 or TLS 1.3 across all Vercel edge networks.
- **Device Credential Storage**:
  - Raw device keys generated using cryptographically secure random bytes (`crypto.randomBytes(16)`).
  - Stored as `salt:hex_digest` generated with a unique 128-bit random salt and SHA-256. Constant-time comparison (`crypto.timingSafeEqual`) prevents timing side-channel attacks.
- **Audio Privacy**:
  - Default `store_audio=false`: audio is processed entirely in ephemeral serverless function memory and never persisted.
  - When `store_audio=true`, audio files are saved in Vercel Blob with unguessable randomly generated paths, and accessible only via authenticated endpoints (`/api/v1/admin/jobs/:id/audio/:type`). Public Blob URLs are never exposed.

---

## 4. Abuse Prevention, Rate Limiting & Quotas

1. **Per-Device Rate Limiting**:
   - Enforced via Upstash Redis atomic counters on minute-based sliding windows (`paralax:rate_limit:{device_id}:{minute}`).
   - Default: 30 requests/minute. Excess requests return HTTP 429 `device_rate_limited` with a `Retry-After` header.
2. **Daily Quotas**:
   - Enforced via daily atomic counters in Redis (`paralax:quota:{device_id}:{YYYY-MM-DD}`).
   - Default: 500 requests/day. Returns HTTP 429 `daily_quota_exceeded`.
3. **Payload & Duration Enforcement**:
   - Vercel functions reject request bodies exceeding 4.5 MB.
   - Files and PCM audio longer than `max_utterance_sec` (15s default, 20s hard cap) are rejected prior to AI processing.
4. **Idempotency Deduplication**:
   - Every device translation request requires an `Idempotency-Key` header with 24-hour TTL in Redis.
   - Prevents duplicate AI invocations on network retry, and mitigates replay attacks.
