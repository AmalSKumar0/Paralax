import { Redis } from '@upstash/redis';
import crypto from 'crypto';

export interface DeviceConfigRecord {
  language_a: string;
  language_b: string;
  mode: 'auto' | 'buttons';
  voice_map?: Record<string, string>;
  speech_rate_pct?: number;
  volume_pct?: number;
  volume?: number;
  tts_speed?: number;
  mic_gain?: number;
  max_recording_sec?: number;
  max_utterance_sec?: number;
  heartbeat_interval_sec?: number;
  conversation_idle_sec?: number;
  config_version?: number;
}

export interface DeviceRecord {
  id: string;
  device_id: string;
  name: string;
  key_hash: string; // format: "salt:hex_digest"
  config: DeviceConfigRecord;
  config_version: number;
  applied_config_version: number;
  last_seen?: string;
  firmware_version?: string;
  rssi?: number;
  free_heap?: number;
  battery_pct?: number;
  uptime_sec?: number;
  status: 'active' | 'revoked';
  created_at: string;
}

export interface DeviceCommandRecord {
  id: string;
  device_id: string;
  type: 'reboot' | 'sync_config' | 'identify' | 'update_firmware' | 'ping';
  payload?: Record<string, any>;
  params?: Record<string, any>;
  status: 'pending' | 'delivered' | 'done' | 'failed' | 'expired';
  created_at: string;
  acked_at?: string;
  detail?: string;
}

export interface TelemetrySampleRecord {
  ts: string;
  rssi?: number;
  free_heap?: number;
  battery_pct?: number;
  uptime_sec?: number;
  temperature?: number;
  error_count?: number;
  audio_level?: number;
  mic_peak?: number;
}

export interface SystemSettings {
  service_enabled: boolean;
  max_utterance_sec: number;
  max_file_size_mb: number;
  max_duration_sec: number;
  retention_days: number;
  store_audio: boolean;
  language_id_min_confidence: number;
  conversation_idle_sec: number;
  rate_limit_per_min?: number;
  daily_quota?: number;
  device_rate_limit_per_min: number;
  device_daily_quota: number;
  default_heartbeat_interval_sec: number;
  allowed_languages: string[];
  voice_map: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export type SettingsRecord = SystemSettings;

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes?: string[];
  created_at: string;
  last_used_at?: string;
  status: 'active' | 'revoked';
}

const DEFAULT_SETTINGS: SystemSettings = {
  service_enabled: true,
  max_utterance_sec: 15,
  max_file_size_mb: 4,
  max_duration_sec: 20,
  retention_days: 30,
  store_audio: false,
  language_id_min_confidence: 0.65,
  conversation_idle_sec: 180,
  device_rate_limit_per_min: 20,
  device_daily_quota: 500,
  default_heartbeat_interval_sec: 30,
  allowed_languages: [
    'en-US', 'es-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR',
    'ja-JP', 'ko-KR', 'zh-CN', 'hi-IN', 'ar-AE', 'ru-RU', 'nl-NL',
  ],
  voice_map: {},
};

// In-Memory store fallback for offline/test environments without live Upstash credentials
class MemoryStore {
  public data: Map<string, any> = new Map();
  public ttls: Map<string, number> = new Map();

  public get<T>(key: string): T | null {
    const expire = this.ttls.get(key);
    if (expire && Date.now() > expire) {
      this.data.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return (this.data.get(key) as T) ?? null;
  }

  public set(key: string, val: any, exSec?: number) {
    this.data.set(key, val);
    if (exSec) {
      this.ttls.set(key, Date.now() + exSec * 1000);
    }
  }

  public del(key: string) {
    this.data.delete(key);
    this.ttls.delete(key);
  }

  public incr(key: string): number {
    const curr = (this.get<number>(key) || 0) + 1;
    this.data.set(key, curr);
    return curr;
  }
}

export function hashSecret(secret: string, salt?: string): string {
  const chosenSalt = salt || crypto.randomBytes(16).toString('hex');
  const digest = crypto.createHash('sha256').update(`${chosenSalt}:${secret}`).digest('hex');
  return `${chosenSalt}:${digest}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedDigest] = storedHash.split(':', 2);
  const actualDigest = crypto.createHash('sha256').update(`${salt}:${secret}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(actualDigest, 'hex'), Buffer.from(expectedDigest, 'hex'));
}

export class RedisStore {
  private client: Redis | null = null;
  private memory: MemoryStore = new MemoryStore();

  constructor() {
    const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
    const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();

    if (url && token && !url.includes('your-database-id')) {
      this.client = new Redis({ url, token });
    }
  }

  public hashKey(secret: string): string {
    return hashSecret(secret);
  }

  public isLive(): boolean {
    return this.client !== null;
  }

  public async ping(): Promise<boolean> {
    if (this.client) {
      try {
        const res = await this.client.ping();
        return res === 'PONG';
      } catch {
        return false;
      }
    }
    return true; // Memory fallback reports healthy in dev
  }

  // --- Settings ---
  public async getSettings(): Promise<SystemSettings> {
    if (this.client) {
      try {
        const val = await this.client.get<SystemSettings>('paralax:settings');
        if (val) return { ...DEFAULT_SETTINGS, ...val };
      } catch (err) {
        console.warn('[Redis] Failed to get settings, falling back to memory/defaults:', err);
      }
    }
    const mem = this.memory.get<SystemSettings>('paralax:settings');
    return mem ? { ...DEFAULT_SETTINGS, ...mem } : { ...DEFAULT_SETTINGS };
  }

  public async updateSettings(partial: Partial<SystemSettings>): Promise<SystemSettings> {
    const curr = await this.getSettings();
    const updated = { ...curr, ...partial };

    if (this.client) {
      try {
        await this.client.set('paralax:settings', updated);
      } catch (err) {
        console.warn('[Redis] Failed to update settings:', err);
      }
    }
    this.memory.set('paralax:settings', updated);
    return updated;
  }

  // --- Devices ---
  public async getDevice(id: string): Promise<DeviceRecord | null> {
    let dev: DeviceRecord | null = null;
    if (this.client) {
      try {
        dev = (await this.client.get<DeviceRecord>(`paralax:device:${id}`)) || null;
      } catch (err) {
        console.warn(`[Redis] Failed to get device ${id}:`, err);
      }
    }
    if (!dev) {
      dev = this.memory.get<DeviceRecord>(`paralax:device:${id}`);
    }
    if (dev) {
      dev.id = dev.id || dev.device_id || id;
      dev.device_id = dev.device_id || dev.id || id;
    }
    return dev;
  }

  public async setDevice(id: string, device: DeviceRecord): Promise<void> {
    device.id = device.id || device.device_id || id;
    device.device_id = device.device_id || device.id || id;

    if (this.client) {
      try {
        await this.client.set(`paralax:device:${id}`, device);
        await this.client.sadd('paralax:devices:index', id);
      } catch (err) {
        console.warn(`[Redis] Failed to set device ${id}:`, err);
      }
    }
    this.memory.set(`paralax:device:${id}`, device);
    const index = this.memory.get<string[]>('paralax:devices:index') || [];
    if (!index.includes(id)) {
      this.memory.set('paralax:devices:index', [...index, id]);
    }
  }

  public async saveDevice(device: DeviceRecord): Promise<void> {
    const id = device.id || device.device_id;
    return this.setDevice(id, device);
  }

  public async updateDeviceState(id: string, partial: Partial<DeviceRecord>): Promise<DeviceRecord | null> {
    const dev = await this.getDevice(id);
    if (!dev) return null;
    const updated: DeviceRecord = {
      ...dev,
      ...partial,
      last_seen: new Date().toISOString(),
    };
    await this.setDevice(id, updated);
    return updated;
  }

  public async listDevices(): Promise<DeviceRecord[]> {
    let ids: string[] = [];
    if (this.client) {
      try {
        ids = (await this.client.smembers('paralax:devices:index')) || [];
      } catch (err) {
        console.warn('[Redis] Failed to list devices index:', err);
      }
    }
    if (ids.length === 0) {
      ids = this.memory.get<string[]>('paralax:devices:index') || [];
    }

    const devices: DeviceRecord[] = [];
    for (const id of ids) {
      const dev = await this.getDevice(id);
      if (dev) devices.push(dev);
    }
    return devices;
  }

  public async deleteDevice(id: string): Promise<void> {
    if (this.client) {
      try {
        await this.client.del(`paralax:device:${id}`);
        await this.client.srem('paralax:devices:index', id);
        await this.client.del(`paralax:commands:${id}`);
        await this.client.del(`paralax:telemetry:${id}`);
      } catch (err) {
        console.warn(`[Redis] Failed to delete device ${id}:`, err);
      }
    }
    this.memory.del(`paralax:device:${id}`);
    const index = this.memory.get<string[]>('paralax:devices:index') || [];
    this.memory.set('paralax:devices:index', index.filter((x) => x !== id));
  }

  // --- Device Key Lookup ---
  public async findDeviceByKey(rawKey: string): Promise<DeviceRecord | null> {
    const devices = await this.listDevices();
    for (const dev of devices) {
      if (dev.status === 'active' && verifySecret(rawKey, dev.key_hash)) {
        return dev;
      }
    }
    return null;
  }

  // --- Commands ---
  public async enqueueCommand(deviceId: string, cmd: DeviceCommandRecord): Promise<void> {
    if (this.client) {
      try {
        await this.client.rpush(`paralax:commands:${deviceId}`, JSON.stringify(cmd));
      } catch (err) {
        console.warn(`[Redis] Failed to enqueue command for ${deviceId}:`, err);
      }
    }
    const cmds = this.memory.get<DeviceCommandRecord[]>(`paralax:commands:${deviceId}`) || [];
    this.memory.set(`paralax:commands:${deviceId}`, [...cmds, cmd]);
  }

  public async getPendingCommands(deviceId: string): Promise<DeviceCommandRecord[]> {
    if (this.client) {
      try {
        const raw = (await this.client.lrange(`paralax:commands:${deviceId}`, 0, -1)) || [];
        return raw.map((r: any) => (typeof r === 'string' ? JSON.parse(r) : r));
      } catch (err) {
        console.warn(`[Redis] Failed to get commands for ${deviceId}:`, err);
      }
    }
    return this.memory.get<DeviceCommandRecord[]>(`paralax:commands:${deviceId}`) || [];
  }

  public async ackCommand(deviceId: string, commandId: string, status: 'done' | 'failed', detail?: string): Promise<boolean> {
    const pending = await this.getPendingCommands(deviceId);
    const targetIdx = pending.findIndex((c) => c.id === commandId);
    if (targetIdx === -1) return false;

    const [cmd] = pending.splice(targetIdx, 1);
    cmd.status = status;
    cmd.acked_at = new Date().toISOString();
    cmd.detail = detail;

    // Save back remaining pending
    if (this.client) {
      try {
        await this.client.del(`paralax:commands:${deviceId}`);
        for (const rem of pending) {
          await this.client.rpush(`paralax:commands:${deviceId}`, JSON.stringify(rem));
        }
        await this.client.lpush(`paralax:command_history:${deviceId}`, JSON.stringify(cmd));
        await this.client.ltrim(`paralax:command_history:${deviceId}`, 0, 49);
      } catch (err) {
        console.warn(`[Redis] Failed to ack command for ${deviceId}:`, err);
      }
    }
    this.memory.set(`paralax:commands:${deviceId}`, pending);
    const hist = this.memory.get<DeviceCommandRecord[]>(`paralax:command_history:${deviceId}`) || [];
    this.memory.set(`paralax:command_history:${deviceId}`, [cmd, ...hist].slice(0, 50));

    return true;
  }

  public async listCommands(deviceId: string): Promise<DeviceCommandRecord[]> {
    const pending = await this.getPendingCommands(deviceId);
    let hist: DeviceCommandRecord[] = [];
    if (this.client) {
      try {
        const raw = (await this.client.lrange(`paralax:command_history:${deviceId}`, 0, 49)) || [];
        hist = raw.map((r: any) => (typeof r === 'string' ? JSON.parse(r) : r));
      } catch (err) {
        console.warn(`[Redis] Failed to list command history for ${deviceId}:`, err);
      }
    }
    if (hist.length === 0) {
      hist = this.memory.get<DeviceCommandRecord[]>(`paralax:command_history:${deviceId}`) || [];
    }
    return [...pending, ...hist];
  }

  // --- Telemetry ---
  public async recordTelemetry(deviceId: string, sample: TelemetrySampleRecord): Promise<void> {
    if (this.client) {
      try {
        await this.client.lpush(`paralax:telemetry:${deviceId}`, JSON.stringify(sample));
        await this.client.ltrim(`paralax:telemetry:${deviceId}`, 0, 199);
        await this.client.expire(`paralax:telemetry:${deviceId}`, 86400 * 3); // 3 days
      } catch (err) {
        console.warn(`[Redis] Failed to record telemetry for ${deviceId}:`, err);
      }
    }
    const samples = this.memory.get<TelemetrySampleRecord[]>(`paralax:telemetry:${deviceId}`) || [];
    this.memory.set(`paralax:telemetry:${deviceId}`, [sample, ...samples].slice(0, 200), 86400 * 3);
  }

  public async getTelemetry(deviceId: string, range: string = '24h'): Promise<TelemetrySampleRecord[]> {
    let samples: TelemetrySampleRecord[] = [];
    if (this.client) {
      try {
        const raw = (await this.client.lrange(`paralax:telemetry:${deviceId}`, 0, 199)) || [];
        samples = raw.map((r: any) => (typeof r === 'string' ? JSON.parse(r) : r));
      } catch (err) {
        console.warn(`[Redis] Failed to get telemetry for ${deviceId}:`, err);
      }
    }
    if (samples.length === 0) {
      samples = this.memory.get<TelemetrySampleRecord[]>(`paralax:telemetry:${deviceId}`) || [];
    }

    const now = Date.now();
    let windowMs = 24 * 3600 * 1000;
    if (range === '1h') windowMs = 3600 * 1000;
    if (range === '6h') windowMs = 6 * 3600 * 1000;
    if (range === '7d') windowMs = 7 * 24 * 3600 * 1000;

    return samples.filter((s) => now - new Date(s.ts).getTime() <= windowMs);
  }

  // --- Idempotency ---
  public async getIdempotencyRecord(deviceId: string, key: string): Promise<any | null> {
    const k = `paralax:idempotency:${deviceId}:${key}`;
    if (this.client) {
      try {
        return await this.client.get<any>(k);
      } catch {
        // Fallback
      }
    }
    return this.memory.get<any>(k);
  }

  public async setIdempotencyRecord(deviceId: string, key: string, data: any, ttlSec: number = 86400): Promise<void> {
    const k = `paralax:idempotency:${deviceId}:${key}`;
    if (this.client) {
      try {
        await this.client.set(k, data, { ex: ttlSec });
        return;
      } catch {
        // Fallback
      }
    }
    this.memory.set(k, data, ttlSec);
  }

  // --- Rate Limiting & Daily Quota ---
  public async checkAndIncrementRateLimit(deviceId: string, limitPerMin: number): Promise<{ ok: boolean; retryAfterSec?: number }> {
    const now = Math.floor(Date.now() / 1000);
    const minuteBucket = Math.floor(now / 60);
    const k = `paralax:rate_limit:${deviceId}:${minuteBucket}`;

    let count = 0;
    if (this.client) {
      try {
        count = await this.client.incr(k);
        if (count === 1) {
          await this.client.expire(k, 60);
        }
      } catch {
        count = this.memory.incr(k);
      }
    } else {
      count = this.memory.incr(k);
    }

    if (count > limitPerMin) {
      const remainingSec = 60 - (now % 60);
      return { ok: false, retryAfterSec: remainingSec };
    }
    return { ok: true };
  }

  public async incrementRateLimit(deviceId: string): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const minuteWindow = Math.floor(now / 60);
    const k = `paralax:rate_limit:${deviceId}:${minuteWindow}`;
    if (this.client) {
      try {
        const count = await this.client.incr(k);
        if (count === 1) await this.client.expire(k, 60);
        return count;
      } catch {
        // Fallback
      }
    }
    return this.memory.incr(k);
  }

  public async checkAndIncrementDailyQuota(deviceId: string, dailyLimit: number): Promise<{ ok: boolean; retryAfterSec?: number }> {
    const now = new Date();
    const dateBucket = now.toISOString().slice(0, 10);
    const k = `paralax:daily_quota:${deviceId}:${dateBucket}`;

    let count = 0;
    if (this.client) {
      try {
        count = await this.client.incr(k);
        if (count === 1) {
          await this.client.expire(k, 86400);
        }
      } catch {
        count = this.memory.incr(k);
      }
    } else {
      count = this.memory.incr(k);
    }

    if (count > dailyLimit) {
      // Calculate seconds until midnight UTC
      const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const retrySec = Math.max(60, Math.floor((nextDay.getTime() - now.getTime()) / 1000));
      return { ok: false, retryAfterSec: retrySec };
    }
    return { ok: true };
  }

  // --- Login Throttling ---
  public async checkLoginThrottle(ip: string, maxAttempts: number = 5, windowSec: number = 900): Promise<boolean> {
    const k = `paralax:login_throttle:${ip}`;
    let attempts = 0;

    if (this.client) {
      try {
        attempts = await this.client.incr(k);
        if (attempts === 1) {
          await this.client.expire(k, windowSec);
        }
      } catch {
        attempts = this.memory.incr(k);
      }
    } else {
      attempts = this.memory.incr(k);
    }

    return attempts <= maxAttempts;
  }

  // --- Machine API Keys ---
  public async createApiKey(data: ApiKeyRecord): Promise<void> {
    if (this.client) {
      try {
        await this.client.set(`paralax:api_key:${data.id}`, data);
        await this.client.sadd('paralax:api_keys:index', data.id);
      } catch (err) {
        console.warn('[Redis] Failed to create API key:', err);
      }
    }
    this.memory.set(`paralax:api_key:${data.id}`, data);
    const index = this.memory.get<string[]>('paralax:api_keys:index') || [];
    this.memory.set('paralax:api_keys:index', [...index, data.id]);
  }

  public async listApiKeys(): Promise<ApiKeyRecord[]> {
    let ids: string[] = [];
    if (this.client) {
      try {
        ids = (await this.client.smembers('paralax:api_keys:index')) || [];
      } catch (err) {
        console.warn('[Redis] Failed to list API keys index:', err);
      }
    }
    if (ids.length === 0) {
      ids = this.memory.get<string[]>('paralax:api_keys:index') || [];
    }

    const keys: ApiKeyRecord[] = [];
    for (const id of ids) {
      const k = this.client
        ? (await this.client.get<ApiKeyRecord>(`paralax:api_key:${id}`)) || this.memory.get<ApiKeyRecord>(`paralax:api_key:${id}`)
        : this.memory.get<ApiKeyRecord>(`paralax:api_key:${id}`);
      if (k) keys.push(k);
    }
    return keys;
  }

  public async deleteApiKey(idOrHash: string): Promise<void> {
    if (this.client) {
      try {
        await this.client.del(`paralax:api_key:${idOrHash}`);
        await this.client.srem('paralax:api_keys:index', idOrHash);
      } catch (err) {
        console.warn('[Redis] Failed to delete API key:', err);
      }
    }
    this.memory.del(`paralax:api_key:${idOrHash}`);
    const index = this.memory.get<string[]>('paralax:api_keys:index') || [];
    this.memory.set('paralax:api_keys:index', index.filter((x) => x !== idOrHash));
  }

  public async findApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const keys = await this.listApiKeys();
    for (const k of keys) {
      if (k.status === 'active' && verifySecret(rawKey, k.key_hash)) {
        return k;
      }
    }
    return null;
  }

  // --- Health Cache ---
  public async getHealthCache<T>(): Promise<T | null> {
    if (this.client) {
      try {
        return await this.client.get<T>('paralax:health_cache');
      } catch {
        // Fallback
      }
    }
    return this.memory.get<T>('paralax:health_cache');
  }

  public async setHealthCache<T>(data: T, ttlSec: number = 30): Promise<void> {
    if (this.client) {
      try {
        await this.client.set('paralax:health_cache', data, { ex: ttlSec });
        return;
      } catch {
        // Fallback
      }
    }
    this.memory.set('paralax:health_cache', data, ttlSec);
  }
}

export const redis = new RedisStore();
export const redisClient = redis;
