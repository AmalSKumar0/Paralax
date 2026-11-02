import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { app } from '../api/index.js';
import { redisClient } from '../api/db/redis.js';
import { EdgeTTSProvider } from '../api/providers/tts/edge.js';
import { pcmToWav } from '../api/shared/audio.js';
import bcrypt from 'bcryptjs';

// Helper to create test PCM audio
function createTestPcm(durationSec = 1.0, freqHz = 440, sampleRate = 16000): Buffer {
  const samples = Math.floor(durationSec * sampleRate);
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freqHz * t) * 0.5 * 32767;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), i * 2);
  }
  return buf;
}

function createSilentPcm(durationSec = 1.0, sampleRate = 16000): Buffer {
  const samples = Math.floor(durationSec * sampleRate);
  return Buffer.alloc(samples * 2, 0);
}

// MSW Server for Provider Mocking
let groqSttCalls = 0;
let groqTranslateCalls = 0;
let groqSttStatus = 200;
let detectedLanguageFromStt = 'en';

const server = setupServer(
  // Groq STT Mock
  http.post('https://api.groq.com/openai/v1/audio/transcriptions', async () => {
    groqSttCalls++;
    if (groqSttStatus !== 200) {
      return new HttpResponse(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
        status: groqSttStatus,
        headers: { 'Retry-After': '30', 'Content-Type': 'application/json' },
      });
    }
    return HttpResponse.json({
      text: 'Hello, how can I help you today?',
      language: detectedLanguageFromStt,
      segments: [{ no_speech_prob: 0.01, avg_logprob: -0.2 }],
    });
  }),

  // xAI STT Mock (for fallback tests)
  http.post('https://api.x.ai/v1/audio/transcriptions', async () => {
    return HttpResponse.json({
      text: 'Fallback transcript from Grok',
      language: detectedLanguageFromStt,
    });
  }),

  // Groq Translate Mock
  http.post('https://api.groq.com/openai/v1/chat/completions', async () => {
    groqTranslateCalls++;
    return HttpResponse.json({
      choices: [{ message: { content: 'Hola, ¿cómo puedo ayudarte hoy?' } }],
    });
  }),

  // xAI Translate Mock
  http.post('https://api.x.ai/v1/chat/completions', async () => {
    return HttpResponse.json({
      choices: [{ message: { content: 'Hola desde Grok' } }],
    });
  }),

  // Provider health check mocks (model list)
  http.get('https://api.groq.com/openai/v1/models', () => {
    return HttpResponse.json({ data: [{ id: 'whisper-large-v3-turbo' }] });
  }),
  http.get('https://api.x.ai/v1/models', () => {
    return HttpResponse.json({ data: [{ id: 'grok-2-latest' }] });
  })
);

describe('Paralax IoT Voice Translator - Node Backend Test Suite', () => {
  const TEST_DEVICE_KEY = 'test_device_secret_key_12345';
  const TEST_DEVICE_ID = 'dev-test-esp32-01';

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' });

    // Set environment variables for tests
    process.env.ADMIN_EMAIL = 'admin@paralax.io';
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('testpassword123', 8);
    process.env.JWT_SECRET = 'test_jwt_secret_must_be_sufficiently_long_32chars';
    process.env.CRON_SECRET = 'test_cron_secret_secure_token';
    process.env.GROQ_API_KEY = 'gsk_mock_groq_api_key';
    process.env.XAI_API_KEY = 'xai_mock_key';
    process.env.ALLOW_PAID_FALLBACK = 'false';
    process.env.STT_PROVIDERS = 'groq,xai';
    process.env.TRANSLATE_PROVIDERS = 'groq,xai';
    process.env.TTS_PROVIDERS = 'edge,xai';

    // Mock Edge TTS synthesize to return deterministic 1s 16kHz PCM
    vi.spyOn(EdgeTTSProvider.prototype, 'synthesize').mockImplementation(async () => {
      return createTestPcm(1.0, 500, 16000);
    });

    // Seed test device in Redis
    await redisClient.setDevice(TEST_DEVICE_ID, {
      id: TEST_DEVICE_ID,
      device_id: TEST_DEVICE_ID,
      name: 'ESP32 Test Device',
      key_hash: redisClient.hashKey(TEST_DEVICE_KEY),
      status: 'active',
      created_at: new Date().toISOString(),
      config: {
        language_a: 'en-US',
        language_b: 'es-ES',
        mode: 'buttons',
        speech_rate_pct: 100,
        volume_pct: 85,
        max_recording_sec: 15,
        heartbeat_interval_sec: 60,
      },
      config_version: 1,
      applied_config_version: 1,
      last_seen: new Date().toISOString(),
      firmware_version: '1.0.0',
      rssi: -65,
    });
  });

  afterAll(() => {
    server.close();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    server.resetHandlers();
    groqSttCalls = 0;
    groqTranslateCalls = 0;
    groqSttStatus = 200;
    detectedLanguageFromStt = 'en';
  });

  // 1. Pipeline Success Test
  it('1. POST /api/v1/device/translate - successfully translates audio in single round trip', async () => {
    const audioPcm = createTestPcm(1.5, 440, 16000);
    const wavAudio = pcmToWav(audioPcm, 16000, 1, 16);

    const res = await app.request('/api/v1/device/translate?source=auto&target=es-ES&format=pcm', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/wav',
        'Accept': 'application/octet-stream',
        'Idempotency-Key': 'idemp-test-success-01',
      },
      body: wavAudio,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/octet-stream');
    expect(res.headers.get('x-job-id')).toBeDefined();
    expect(res.headers.get('x-detected-language')).toBe('en-US');
    expect(res.headers.get('x-target-language')).toBe('es-ES');
    expect(res.headers.get('x-transcript')).toBeDefined();
    expect(res.headers.get('x-translation')).toBeDefined();
    expect(res.headers.get('x-timings-total-ms')).toBeDefined();

    const outputAudio = await res.arrayBuffer();
    expect(outputAudio.byteLength).toBeGreaterThan(0);
    expect(groqSttCalls).toBe(1);
    expect(groqTranslateCalls).toBe(1);
  });

  // 2. Silence check -> 422 no_speech_detected
  it('2. POST /api/v1/device/translate - rejects silent audio with 422 no_speech_detected', async () => {
    const silentPcm = createSilentPcm(2.0, 16000);

    const res = await app.request('/api/v1/device/translate?source=en-US&target=es-ES', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': 'idemp-test-silence-01',
      },
      body: silentPcm,
    });

    expect(res.status).toBe(422);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('no_speech_detected');
  });

  // 3. Auto-detect language mismatch -> 422 low_confidence_language
  it('3. POST /api/v1/device/translate - rejects detected language outside device config', async () => {
    detectedLanguageFromStt = 'de'; // German is not in device config (en-US, es-ES)
    const audioPcm = createTestPcm(1.0, 440, 16000);

    const res = await app.request('/api/v1/device/translate?source=auto', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': 'idemp-test-lang-mismatch-01',
      },
      body: audioPcm,
    });

    expect(res.status).toBe(422);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('low_confidence_language');
  });

  // 4. Provider 429 fallback and all-failed
  it('4. Provider 429 fallback to xAI, and provider_rate_limited when all fail', async () => {
    // 4a: Groq returns 429, xAI succeeds as fallback
    process.env.ALLOW_PAID_FALLBACK = 'true';
    groqSttStatus = 429;
    const audioPcm = createTestPcm(1.0, 440, 16000);

    const resFallback = await app.request('/api/v1/device/translate?source=en-US&target=es-ES', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': 'idemp-test-fallback-01',
      },
      body: audioPcm,
    });

    expect(resFallback.status).toBe(200);
    const dataFallback = (await resFallback.json()) as any;
    expect(dataFallback.transcript).toBe('Fallback transcript from Grok');

    // 4b: Both providers fail with 429
    server.use(
      http.post('https://api.x.ai/v1/audio/transcriptions', () => {
        return new HttpResponse(JSON.stringify({ error: { message: 'xAI 429' } }), {
          status: 429,
          headers: { 'Retry-After': '45', 'Content-Type': 'application/json' },
        });
      })
    );

    const resAllFailed = await app.request('/api/v1/device/translate?source=en-US&target=es-ES', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': 'idemp-test-all-failed-01',
      },
      body: audioPcm,
    });

    process.env.ALLOW_PAID_FALLBACK = 'false';

    expect(resAllFailed.status).toBe(429);
    const errData = (await resAllFailed.json()) as any;
    expect(errData.error.code).toBe('provider_rate_limited');
    expect(errData.error.retry_after_sec).toBeDefined();
  });

  // 5. Paid-fallback blocked
  it('5. Blocks paid fallback provider when ALLOW_PAID_FALLBACK=false', async () => {
    process.env.ALLOW_PAID_FALLBACK = 'false';
    const originalProviders = process.env.TTS_PROVIDERS;
    process.env.TTS_PROVIDERS = 'xai'; // xai TTS is a paid adapter

    const audioPcm = createTestPcm(1.0, 440, 16000);

    const res = await app.request('/api/v1/device/translate?source=en-US&target=es-ES', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': 'idemp-test-paid-blocked-01',
      },
      body: audioPcm,
    });

    expect(res.status).toBe(502);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('all_providers_failed');

    process.env.TTS_PROVIDERS = originalProviders;
  });

  // 6. Idempotent retry
  it('6. Idempotent request returns stored transcript/translation and only reruns TTS', async () => {
    const audioPcm = createTestPcm(1.0, 440, 16000);
    const idempKey = 'idemp-repeat-test-999';

    // First call
    const res1 = await app.request('/api/v1/device/translate?source=en-US&target=es-ES', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': idempKey,
      },
      body: audioPcm,
    });
    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as any;
    expect(groqSttCalls).toBe(1);
    expect(groqTranslateCalls).toBe(1);

    // Second call with same idempotency key
    const res2 = await app.request('/api/v1/device/translate?source=en-US&target=es-ES', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': idempKey,
      },
      body: audioPcm,
    });
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as any;

    // Transcript and translation must match
    expect(data2.transcript).toBe(data1.transcript);
    expect(data2.translation).toBe(data1.translation);

    // Groq STT and Translate must NOT have been called a second time
    expect(groqSttCalls).toBe(1);
    expect(groqTranslateCalls).toBe(1);
  });

  // 7. Device Authentication
  it('7. Device authentication rejects missing or invalid keys, and revoked keys', async () => {
    const audioPcm = createTestPcm(1.0, 440, 16000);

    // Missing key
    const resMissing = await app.request('/api/v1/device/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/L16;rate=16000' },
      body: audioPcm,
    });
    expect(resMissing.status).toBe(401);

    // Invalid key
    const resInvalid = await app.request('/api/v1/device/translate', {
      method: 'POST',
      headers: {
        'X-Device-Key': 'px_dev_invalid_key_random',
        'Content-Type': 'audio/L16;rate=16000',
      },
      body: audioPcm,
    });
    expect(resInvalid.status).toBe(401);
  });

  // 8. Rate Limiting and Quota
  it('8. Enforces per-device rate limiting in Redis', async () => {
    const rateLimitedDevKey = 'px_rate_limit_test_key_abc';
    const rateLimitedDevId = 'dev-rate-limit-test';

    await redisClient.setDevice(rateLimitedDevId, {
      id: rateLimitedDevId,
      device_id: rateLimitedDevId,
      name: 'Rate Limited Device',
      key_hash: redisClient.hashKey(rateLimitedDevKey),
      status: 'active',
      created_at: new Date().toISOString(),
      config: {
        language_a: 'en-US',
        language_b: 'es-ES',
        mode: 'buttons',
        speech_rate_pct: 100,
        volume_pct: 85,
        max_recording_sec: 15,
        heartbeat_interval_sec: 60,
      },
      config_version: 1,
      applied_config_version: 1,
      last_seen: new Date().toISOString(),
      firmware_version: '1.0.0',
      rssi: -60,
    });

    // Simulate 31 requests in Redis to trigger limit (> 30/min default)
    for (let i = 0; i < 31; i++) {
      await redisClient.incrementRateLimit(rateLimitedDevId);
    }

    const audioPcm = createTestPcm(1.0, 440, 16000);
    const res = await app.request('/api/v1/device/translate?source=en-US&target=es-ES', {
      method: 'POST',
      headers: {
        'X-Device-Key': rateLimitedDevKey,
        'Content-Type': 'audio/L16;rate=16000',
        'Idempotency-Key': 'idemp-rate-limit-01',
      },
      body: audioPcm,
    });

    expect(res.status).toBe(429);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('device_rate_limited');
  });

  // 9. Heartbeat, Config, and Command flow
  it('9. Device heartbeat, config fetch, and command flow work seamlessly', async () => {
    // Heartbeat
    const hbRes = await app.request('/api/v1/device/heartbeat', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firmware_version: '1.0.0',
        rssi: -60,
        free_heap: 150000,
        uptime_sec: 1200,
        battery_pct: 90,
        config_version: 1,
      }),
    });
    expect(hbRes.status).toBe(200);
    const hbData = (await hbRes.json()) as any;
    expect(hbData.config_changed).toBe(false);

    // Fetch config
    const cfgRes = await app.request('/api/v1/device/config', {
      method: 'GET',
      headers: { 'X-Device-Key': TEST_DEVICE_KEY },
    });
    expect(cfgRes.status).toBe(200);
    const cfgData = (await cfgRes.json()) as any;
    expect(cfgData.language_a).toBe('en-US');
    expect(cfgData.language_b).toBe('es-ES');
  });

  // 10. Admin Authentication
  it('10. Admin login, session validation, and logout', async () => {
    // Login with wrong password
    const badLoginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email: 'admin@paralax.io', password: 'wrongpassword' }),
    });
    expect(badLoginRes.status).toBe(401);

    // Login with correct password
    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ email: 'admin@paralax.io', password: 'testpassword123' }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()) as any;
    expect(loginData.token).toBeDefined();

    // Verify /auth/me with bearer token
    const meRes = await app.request('/api/v1/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as any;
    expect(meData.authenticated).toBe(true);
    expect(meData.user.email).toBe('admin@paralax.io');

    // Logout
    const logoutRes = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginData.token}`, 'X-Requested-With': 'XMLHttpRequest' },
    });
    expect(logoutRes.status).toBe(200);
  });

  // 11. Cron Retention Cleanup
  it('11. Cron retention cleanup requires CRON_SECRET and deletes expired records', async () => {
    // Missing secret -> 401
    const unauthRes = await app.request('/api/cron/retention', { method: 'POST' });
    expect(unauthRes.status).toBe(401);

    // Authorized
    const authRes = await app.request('/api/cron/retention', {
      method: 'POST',
      headers: { Authorization: 'Bearer test_cron_secret_secure_token' },
    });
    expect(authRes.status).toBe(200);
    const cronData = (await authRes.json()) as any;
    expect(cronData.success).toBe(true);
    expect(cronData.deleted_jobs).toBeDefined();
  });

  // 12. GET /api/v1/languages
  it('12. GET /api/v1/languages returns registry with capabilities and valid targets', async () => {
    const res = await app.request('/api/v1/languages', { method: 'GET' });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.languages)).toBe(true);
    expect(data.languages.length).toBeGreaterThan(0);
    const en = data.languages.find((l: any) => l.code === 'en-US');
    expect(en).toBeDefined();
    expect(en.capabilities.stt).toBe(true);
    expect(en.capabilities.translate).toBe(true);
    expect(en.capabilities.tts).toBe(true);
  });
});
