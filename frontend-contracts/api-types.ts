/**
 * TypeScript API definitions generated from openapi.yaml
 * IoT Two-Way Voice Translator Backend API (v2.0.0 - Vercel Edition)
 */

export type ErrorCode =
  | 'unsupported_language_pair'
  | 'no_speech_detected'
  | 'low_confidence_language'
  | 'audio_too_long'
  | 'invalid_audio_format'
  | 'rate_limited'
  | 'device_rate_limited'
  | 'provider_rate_limited'
  | 'daily_quota_exceeded'
  | 'missing_idempotency_key'
  | 'idempotent_in_progress'
  | 'missing_csrf_header'
  | 'cannot_retry'
  | 'service_disabled'
  | 'unauthorized'
  | 'not_found'
  | 'invalid_credentials';

export interface ApiError {
  code: ErrorCode | string;
  message: string;
  retry_after_sec?: number;
}

export interface ErrorResponse {
  error: ApiError;
}

export type JobKind = 'utterance' | 'file';

export type JobStatus =
  | 'queued'
  | 'transcribing'
  | 'translating'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DeviceMode = 'auto' | 'buttons';

export type CommandType = 'reboot' | 'sync_config' | 'identify' | 'update_firmware' | 'ping';

export type CommandStatus = 'pending' | 'delivered' | 'done' | 'failed' | 'expired';

export interface DeviceConfig {
  config_version: number;
  language_a: string;
  language_b: string;
  mode: DeviceMode;
  voice_map?: Record<string, string>;
  speech_rate_pct?: number;
  volume_pct?: number;
  volume?: number;
  tts_speed?: number;
  mic_gain?: number;
  max_recording_sec?: number;
  max_utterance_sec?: number;
  conversation_idle_sec?: number;
  heartbeat_interval_sec?: number;
}

export interface DeviceCommand {
  id: string;
  device_id: string;
  type: CommandType;
  status: CommandStatus;
  created_at: string;
  acked_at?: string;
  detail?: string;
}

export interface TelemetrySample {
  ts: string;
  rssi?: number;
  free_heap?: number;
  battery_pct?: number;
  uptime_sec?: number;
  temperature?: number;
  error_count?: number;
}

export interface Device {
  id: string;
  device_id: string;
  name: string;
  status: 'active' | 'revoked';
  online?: boolean;
  last_seen?: string;
  firmware_version?: string;
  rssi?: number;
  config_version: number;
  applied_config_version: number;
  config: DeviceConfig;
  created_at: string;
}

export interface JobTimings {
  stt_ms: number;
  translate_ms: number;
  synthesize_ms: number;
  total_ms: number;
}

export interface JobAudio {
  url?: string;
  base64?: string;
  format: string;
  sample_rate: number;
  duration_ms: number;
}

export interface Job {
  jobId: string;
  kind: JobKind;
  deviceId?: string;
  conversationId?: string;
  status: JobStatus;
  sourceLanguage: string;
  detectedLanguage?: string;
  targetLanguage: string;
  transcript?: string;
  translation?: string;
  canRetry: boolean;
  durationSec?: number;
  sttMs?: number;
  translateMs?: number;
  synthesizeMs?: number;
  totalMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  conversationId: string;
  deviceId: string;
  createdAt: string;
  lastUtteranceAt: string;
  utteranceCount: number;
  jobs?: Job[];
}

export interface Voice {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  neural: boolean;
  provider: 'edge' | 'xai' | 'groq';
}

export interface LanguageCapabilities {
  stt: boolean;
  translate: boolean;
  tts: boolean;
  stt_streaming?: boolean;
  stt_batch?: boolean;
  stt_language_id?: boolean;
  tts_neural?: boolean;
  tts_standard?: boolean;
}

export interface Language {
  code: string;
  name: string;
  iso_code?: string;
  whisper_code?: string;
  capabilities: LanguageCapabilities;
  valid_targets: string[];
  voices: Voice[];
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string;
  status: 'active' | 'revoked';
}

export interface LatencyMetric {
  p50: number;
  p95: number;
}

export interface AdminStats {
  counts_by_status: Record<string, number>;
  counts_by_kind: Record<string, number>;
  jobs_per_day: Array<{ date: string; count: number; failed: number }>;
  failure_rate: number;
  devices_online: number;
  devices_total: number;
  top_language_pairs: Array<{ pair: string; count: number; percentage: number }>;
  total_audio_minutes: number;
  utterances_today: number;
  jobs_in_progress: number;
  latency: {
    total: LatencyMetric;
    stt: LatencyMetric;
    translate: LatencyMetric;
    synthesize: LatencyMetric;
  };
}

export interface ServiceHealthItem {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  checked_at: string;
  latency_ms: number;
}

export interface SystemHealth {
  services: ServiceHealthItem[];
  offline_devices: Device[];
  recent_failures: Job[];
  cached?: boolean;
}

export interface SettingsProvidersBlock {
  stt_chains: string[];
  translate_chains: string[];
  tts_chains: string[];
  allow_paid_fallback: boolean;
  models: {
    groq_stt_model: string;
    groq_chat_model: string;
    xai_chat_model: string;
  };
  call_counts?: Record<string, any>;
}

export interface Settings {
  service_enabled: boolean;
  max_utterance_sec: number;
  max_file_size_mb: number;
  max_duration_sec: number;
  retention_days: number;
  store_audio: boolean;
  language_id_min_confidence: number;
  conversation_idle_sec: number;
  device_rate_limit_per_min: number;
  device_daily_quota: number;
  default_heartbeat_interval_sec: number;
  allowed_languages: string[];
  voice_map: Record<string, string>;
  providers: SettingsProvidersBlock;
}
