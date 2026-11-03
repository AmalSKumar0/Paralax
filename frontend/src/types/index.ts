export type DeviceMode = 'buttons' | 'auto_detect';

export interface DeviceConfig {
  language_a: string;
  language_b: string;
  mode: DeviceMode;
  voice_map: Record<string, string>; // language code -> voice id
  speech_rate_pct: number;           // e.g. 100%
  volume_pct: number;                // e.g. 85%
  max_recording_sec: number;         // e.g. 15
  heartbeat_interval_sec: number;    // e.g. 60
}

export interface Device {
  device_id: string;
  name: string;
  online: boolean;
  last_seen: string;
  firmware_version: string;
  rssi: number;                      // e.g. -65 dBm
  config_version: number;
  applied_config_version: number;
  config: DeviceConfig;
  created_at: string;
}

export interface TelemetrySample {
  ts: string;
  rssi: number;
  free_heap: number;     // in bytes or KB
  battery_pct: number;   // 0 - 100
  uptime_sec: number;
  audio_level?: number;  // 0 - 100% volume / signal
  mic_peak?: number;
}

export type TelemetryMetricType = 'rssi' | 'free_heap' | 'battery_pct' | 'uptime_sec' | 'audio_level';

export type CommandType = 'reboot' | 'sync_config' | 'identify';
export type CommandStatus = 'pending' | 'delivered' | 'done' | 'failed' | 'expired';

export interface DeviceCommand {
  id: string;
  device_id: string;
  type: CommandType;
  status: CommandStatus;
  created_at: string;
  acked_at?: string;
  detail?: string;
}

export interface Voice {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  neural: boolean;
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

export type JobKind = 'utterance' | 'file';
export type JobStatus = 'queued' | 'stt' | 'translating' | 'synthesizing' | 'completed' | 'failed' | 'cancelled';

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
  expires_in?: number;
}

export interface ApiJob {
  job_id: string;
  jobId?: string;
  kind: JobKind;
  device_id?: string;
  deviceId?: string;
  conversation_id?: string;
  conversationId?: string;
  filename?: string;
  status: JobStatus;
  source_language: string;
  sourceLanguage?: string;
  detected_language?: string;
  detectedLanguage?: string;
  target_language: string;
  targetLanguage?: string;
  transcript?: string;
  translation?: string;
  can_retry?: boolean;
  canRetry?: boolean;
  audio?: JobAudio;
  original_audio_url?: string;
  translated_audio_url?: string;
  duration_sec?: number;
  durationSec?: number;
  timings?: JobTimings;
  sttMs?: number;
  translateMs?: number;
  synthesizeMs?: number;
  totalMs?: number;
  error?: {
    code: string;
    message: string;
    retry_after_sec?: number;
  };
  created_at: string;
  createdAt?: string | Date;
  updated_at: string;
  updatedAt?: string | Date;
}

export interface ConversationTurn extends ApiJob {
  turn_index: number;
}

export interface Conversation {
  conversation_id: string;
  conversationId?: string;
  device_id: string;
  deviceId?: string;
  started_at: string;
  createdAt?: string | Date;
  updated_at: string;
  lastUtteranceAt?: string | Date;
  utteranceCount?: number;
  turns: ConversationTurn[];
  jobs?: ApiJob[];
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
  providers?: SettingsProvidersBlock;
}

export interface LatencyMetric {
  p50: number;
  p95: number;
}

export interface AdminStats {
  counts_by_status: Record<JobStatus, number>;
  counts_by_kind: Record<JobKind, number>;
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
  recent_failures: ApiJob[];
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string;
  status: 'active' | 'revoked';
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    retry_after_sec?: number;
  };
}
