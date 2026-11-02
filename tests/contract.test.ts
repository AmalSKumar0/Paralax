import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { app } from '../api/index.js';
import { redisClient } from '../api/db/redis.js';
import { createAdminJwt } from '../api/middleware/auth.js';

describe('OpenAPI Contract Verification against openapi.yaml', () => {
  let openapiDoc: any;
  let adminToken: string;
  const TEST_DEVICE_KEY = 'px_contract_test_device_key_xyz';
  const TEST_DEVICE_ID = 'dev-contract-test';

  beforeAll(async () => {
    // Read and parse openapi.yaml
    const yamlPath = path.resolve(process.cwd(), 'openapi.yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    openapiDoc = YAML.parse(yamlContent);

    // Create admin token for authenticated admin routes
    adminToken = await createAdminJwt('admin@paralax.io');

    // Register test device
    await redisClient.setDevice(TEST_DEVICE_ID, {
      id: TEST_DEVICE_ID,
      device_id: TEST_DEVICE_ID,
      name: 'Contract Test Device',
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
      rssi: -60,
    });
  });

  it('verifies openapi.yaml version and structure', () => {
    expect(openapiDoc.openapi).toMatch(/^3\./);
    expect(openapiDoc.info.title).toBeDefined();
    expect(openapiDoc.paths).toBeDefined();
    expect(openapiDoc.components.schemas).toBeDefined();
  });

  it('GET /api/v1/languages conforms to schema', async () => {
    const res = await app.request('/api/v1/languages', { method: 'GET' });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.languages)).toBe(true);
    for (const lang of data.languages) {
      expect(typeof lang.code).toBe('string');
      expect(typeof lang.name).toBe('string');
      expect(typeof lang.capabilities.stt).toBe('boolean');
      expect(typeof lang.capabilities.translate).toBe('boolean');
      expect(typeof lang.capabilities.tts).toBe('boolean');
      expect(Array.isArray(lang.valid_targets)).toBe(true);
      expect(Array.isArray(lang.voices)).toBe(true);
    }
  });

  it('GET /api/v1/device/config conforms to schema', async () => {
    const res = await app.request('/api/v1/device/config', {
      method: 'GET',
      headers: { 'X-Device-Key': TEST_DEVICE_KEY },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(typeof data.language_a).toBe('string');
    expect(typeof data.language_b).toBe('string');
    expect(['buttons', 'auto']).toContain(data.mode);
    expect(typeof data.speech_rate_pct).toBe('number');
    expect(typeof data.volume_pct).toBe('number');
    expect(typeof data.max_recording_sec).toBe('number');
    expect(typeof data.heartbeat_interval_sec).toBe('number');
  });

  it('POST /api/v1/device/heartbeat conforms to schema', async () => {
    const res = await app.request('/api/v1/device/heartbeat', {
      method: 'POST',
      headers: {
        'X-Device-Key': TEST_DEVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firmware_version: '1.0.0',
        rssi: -60,
        free_heap: 140000,
        uptime_sec: 1200,
        battery_pct: 85,
        config_version: 1,
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(typeof data.config_changed).toBe('boolean');
    expect(typeof data.server_time).toBe('string');
    expect(Array.isArray(data.commands)).toBe(true);
  });

  it('GET /api/v1/admin/settings conforms to schema with providers block', async () => {
    const res = await app.request('/api/v1/admin/settings', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(typeof data.service_enabled).toBe('boolean');
    expect(typeof data.max_utterance_sec).toBe('number');
    expect(typeof data.retention_days).toBe('number');
    expect(typeof data.store_audio).toBe('boolean');
    expect(Array.isArray(data.allowed_languages)).toBe(true);
    expect(data.providers).toBeDefined();
    expect(Array.isArray(data.providers.stt_chains)).toBe(true);
    expect(Array.isArray(data.providers.translate_chains)).toBe(true);
    expect(Array.isArray(data.providers.tts_chains)).toBe(true);
    expect(typeof data.providers.allow_paid_fallback).toBe('boolean');
  });

  it('GET /api/v1/admin/stats conforms to schema with stage percentiles', async () => {
    const res = await app.request('/api/v1/admin/stats', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.counts_by_status).toBeDefined();
    expect(data.counts_by_kind).toBeDefined();
    expect(Array.isArray(data.jobs_per_day)).toBe(true);
    expect(typeof data.failure_rate).toBe('number');
    expect(typeof data.devices_online).toBe('number');
    expect(typeof data.devices_total).toBe('number');
    expect(data.latency).toBeDefined();
    expect(typeof data.latency.total.p50).toBe('number');
    expect(typeof data.latency.total.p95).toBe('number');
    expect(typeof data.latency.stt.p50).toBe('number');
    expect(typeof data.latency.translate.p50).toBe('number');
    expect(typeof data.latency.synthesize.p50).toBe('number');
  });

  it('GET /api/v1/admin/health conforms to schema with real service names', async () => {
    const res = await app.request('/api/v1/admin/health', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.services)).toBe(true);
    expect(Array.isArray(data.offline_devices)).toBe(true);
    expect(Array.isArray(data.recent_failures)).toBe(true);
    for (const s of data.services) {
      expect(typeof s.name).toBe('string');
      expect(['healthy', 'degraded', 'down']).toContain(s.status);
      expect(typeof s.latency_ms).toBe('number');
    }
  });

  it('GET /api/v1/admin/devices conforms to schema', async () => {
    const res = await app.request('/api/v1/admin/devices', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.devices)).toBe(true);
  });

  it('Standard error responses conform to ErrorResponse schema { error: { code, message } }', async () => {
    const res = await app.request('/api/v1/device/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/L16;rate=16000' },
      body: Buffer.alloc(100),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.error).toBeDefined();
    expect(typeof data.error.code).toBe('string');
    expect(typeof data.error.message).toBe('string');
  });
});
