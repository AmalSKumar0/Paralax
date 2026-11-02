# Security Controls & Hardening Checklist

This document details the security posture, cryptographic controls, and threat mitigations implemented across the serverless voice translator backend.

---

## 1. Authentication & Authorization Matrix

| Route Pattern | Target Consumer | Auth Mechanism | Credentials / Secret Handling | Revocation Propagation |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/device/*` | ESP32 Hardware | Custom Lambda Authorizer | Header `X-Device-Key`. Raw keys are **never stored**; only salted SHA-256 hashes (`salt:digest`) are persisted in DynamoDB. | $\le 60\text{ seconds}$ (API Gateway cache TTL = 60s) |
| `/v1/admin/*` | Admin Dashboard | Cognito User Pool JWT | Bearer tokens signed by Amazon Cognito with RS256. Validated at API Gateway layer. | Immediate via token expiry or Cognito global sign-out |
| `/v1/utterances` | Test Console | Cognito User Pool JWT | Admin JWT token | Immediate |
| `/v1/uploads`, `/v1/jobs` | Machine Clients / Admin | Cognito JWT or `x-api-key` | Machine client keys validated against hashed entries in `ParalaxApiKeys` table. | Immediate on key deletion |

---

## 2. Least-Privilege IAM Policies

Every Lambda function in `template.yaml` is assigned an isolated, granular execution role:

1. **`TranslateUtteranceFunction`**:
   - `transcribe:StartStreamTranscription`
   - `translate:TranslateText`
   - `polly:SynthesizeSpeech`
   - Scoped DynamoDB access only to `ParalaxJobs`, `ParalaxIdempotency`, `ParalaxRateLimits`, and read access to `ParalaxDevices` and `ParalaxSettings`.
   - Scoped S3 Put/Get access only to `ParalaxAudioBucket`.
2. **`DeviceHeartbeatFunction`**:
   - CRUD on `ParalaxDevices`, `ParalaxDeviceCommands`, and `ParalaxTelemetry`. No access to S3 or AI services.
3. **`StepFunctionsPipeline`**:
   - Task Lambdas only have access to their specific downstream service (`transcribe:*`, `translate:*`, `polly:*`).
   - Finalizer Lambda has no AI service permissions; only DynamoDB job updates and EMF metrics emission.

---

## 3. Cryptography & Data Protection

- **Data in Transit**:
  - All communication strictly enforced over TLS 1.2 or TLS 1.3 via Amazon API Gateway HTTP API.
  - Plaintext HTTP is completely rejected.
- **Data at Rest**:
  - **S3 Audio Bucket**: Default server-side encryption enabled with AES-256 (`SSEAlgorithm: AES256`). Public access block fully enforced (`BlockPublicAcls`, `BlockPublicPolicy`, `IgnorePublicAcls`, `RestrictPublicBuckets`).
  - **DynamoDB Tables**: Encrypted at rest using AWS KMS default encryption.
- **Device Credential Storage**:
  - Raw device keys are generated using cryptographically secure random bytes (`secrets.token_urlsafe(24)`).
  - Stored strictly as `salt:hex_digest` generated with a unique 128-bit random salt and SHA-256. Timing-safe comparison (`secrets.compare_digest`) prevents timing attacks.

---

## 4. Abuse Prevention, Rate Limiting & Quotas

1. **Per-Device Rate Limiting**:
   - Enforced using DynamoDB atomic increments on minute-based window keys (`RATE:{device_id}:{minute}`).
   - Configurable in `ParalaxSettings` (default: 20 requests/minute). Excess requests return HTTP 429 `rate_limited` with a `Retry-After` header.
2. **Daily Quotas**:
   - Enforced using daily atomic counters (`QUOTA:{device_id}:{YYYY-MM-DD}`).
   - Default: 500 requests/day. Returns HTTP 429 `quota_exceeded`.
3. **Audio Duration Enforcement**:
   - Audio payload duration is computed directly from raw byte lengths and WAV PCM chunk headers.
   - Files longer than `max_utterance_sec` (15s default, 30s hard cap) are rejected immediately prior to AI processing, preventing Denial of Wallet (DoW) attacks.
4. **Idempotency Deduplication**:
   - Every device request requires an `Idempotency-Key` header.
   - Prevents duplicate AI invocations on network retry, and mitigates replay attacks.

---

## 5. Network & Cross-Origin Resource Sharing (CORS)

- CORS is isolated via the SAM parameter `CorsAllowOrigin` (e.g. `https://admin.yourdomain.com`).
- Allowed headers and methods are explicitly enumerated. Wildcard origins are restricted in staging and production environments.

---

## 6. Audit Logging & Compliance

- **Structured Correlation**:
  - Every log entry emits JSON containing `job_id`, `device_id`, and `conversation_id`.
- **AWS X-Ray**:
  - Active tracing enabled across API Gateway and Lambda functions to detect bottlenecks and tracing paths across AWS services.
- **Data Lifecycle**:
  - S3 audio objects are automatically deleted by S3 Lifecycle rules based on `RetentionDays` (default 30 days).
  - Telemetry logs expire automatically after 3 days via DynamoDB TTL.
  - Idempotency records expire automatically after 24 hours via DynamoDB TTL.
