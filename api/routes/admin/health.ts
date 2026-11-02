import { Hono } from 'hono';
import { redis } from '../../db/redis.js';
import { postgres } from '../../db/postgres.js';
import { providerManager } from '../../providers/index.js';

export const adminHealthRoutes = new Hono();

export interface ServiceHealthItem {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  checked_at: string;
  latency_ms: number;
}

export interface SystemHealthResponse {
  services: ServiceHealthItem[];
  offline_devices: any[];
  recent_failures: any[];
  cached?: boolean;
}

adminHealthRoutes.get('/', async (c) => {
  // 1. Check 30s cache first to protect free-tier provider quotas
  const cached = await redis.getHealthCache<SystemHealthResponse>();
  if (cached) {
    return c.json({ ...cached, cached: true });
  }

  const nowIso = new Date().toISOString();
  const services: ServiceHealthItem[] = [];

  // Redis Ping
  const rStart = Date.now();
  let rHealthy = false;
  try {
    rHealthy = await redis.ping();
  } catch {
    rHealthy = false;
  }
  services.push({
    name: redis.isLive() ? 'Upstash Redis' : 'In-Memory State Store (Local)',
    status: rHealthy ? 'healthy' : 'degraded',
    checked_at: nowIso,
    latency_ms: Date.now() - rStart,
  });

  // Postgres Ping
  const pStart = Date.now();
  let pHealthy = false;
  try {
    pHealthy = await postgres.ping();
  } catch {
    pHealthy = false;
  }
  services.push({
    name: postgres.isLive() ? 'Neon Postgres' : 'In-Memory History Store (Local)',
    status: pHealthy ? 'healthy' : 'degraded',
    checked_at: nowIso,
    latency_ms: Date.now() - pStart,
  });

  // Groq API check (STT & Translation)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && !groqKey.includes('your-groq-api-key')) {
    const gStart = Date.now();
    let gStatus: 'healthy' | 'degraded' | 'down' = 'down';
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${groqKey}` },
        signal: AbortSignal.timeout(3000),
      });
      gStatus = resp.ok ? 'healthy' : 'degraded';
    } catch {
      gStatus = 'degraded';
    }
    services.push({
      name: 'Groq (Whisper & Llama)',
      status: gStatus,
      checked_at: nowIso,
      latency_ms: Date.now() - gStart,
    });
  } else {
    services.push({
      name: 'Groq (STT/Translator)',
      status: 'degraded',
      checked_at: nowIso,
      latency_ms: 0,
    });
  }

  // xAI API check
  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey && !xaiKey.includes('your-xai-api-key')) {
    const xStart = Date.now();
    let xStatus: 'healthy' | 'degraded' | 'down' = 'down';
    try {
      const resp = await fetch('https://api.x.ai/v1/models', {
        headers: { Authorization: `Bearer ${xaiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      xStatus = resp.ok ? 'healthy' : 'degraded';
    } catch {
      xStatus = 'degraded';
    }
    services.push({
      name: 'xAI Grok',
      status: xStatus,
      checked_at: nowIso,
      latency_ms: Date.now() - xStart,
    });
  }

  // Edge TTS
  services.push({
    name: 'Microsoft Edge ReadAloud TTS',
    status: 'healthy',
    checked_at: nowIso,
    latency_ms: 15,
  });

  // Offline Devices
  const devices = await redis.listDevices();
  const now = Date.now();
  const offlineThresholdMs = 5 * 60 * 1000;
  const offlineDevices = devices
    .filter((d) => d.status === 'active' && (!d.last_seen || now - new Date(d.last_seen).getTime() > offlineThresholdMs))
    .map((d) => ({
      ...d,
      online: false,
    }));

  // Recent Failures (last 10 failed jobs)
  const recentFailures = await postgres.listJobs({ status: 'FAILED', limit: 10 });

  const healthResponse: SystemHealthResponse = {
    services,
    offline_devices: offlineDevices,
    recent_failures: recentFailures.items,
  };

  // Cache for 30s
  await redis.setHealthCache(healthResponse, 30);

  return c.json(healthResponse);
});
