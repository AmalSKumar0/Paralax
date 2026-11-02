/**
 * TypeScript API definitions generated from openapi.yaml
 * IoT Two-Way Voice Translator Backend API (v1.0.0)
 */

export type ErrorCode =
  | "unsupported_language_pair"
  | "no_speech_detected"
  | "low_confidence_language"
  | "audio_too_long"
  | "invalid_audio_format"
  | "rate_limited"
  | "quota_exceeded"
  | "service_disabled"
  | "in_progress"
  | "already_completed"
  | "unauthorized"
  | "not_found";

export interface ApiError {
  code: ErrorCode | string;
  message: string;
  retry_after_sec?: number;
}

export interface ErrorResponse {
  error: ApiError;
}

export type JobKind = "utterance" | "file";

export type JobStatus =
  | "QUEUED"
  | "TRANSCRIBING"
  | "TRANSLATING"
  | "SYNTHESIZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type DeviceMode = "auto" | "buttons";

export type CommandType = "reboot" | "sync_config" | "identify";

export type CommandStatus = "pending" | "delivered" | "done" | "failed" | "expired";

export interface DeviceConfig {
  config_version: number;
  language_a: string;
  language_b: string;
  mode: DeviceMode;
  voice_map?: Record<string, string>;
  speech_rate_pct?: number;
  volume_pct?: number;
  max_recording_sec?: number;
  heartbeat_interval_sec?: number;
}

export interface DeviceCommand {
  id: string;
  type: CommandType;
  params: Record<string, unknown>;
}

export interface HeartbeatRequest {
  firmware_version: string;
  rssi: number;
  free_heap: number;
  uptime_sec: number;
  battery_pct?: number;
  config_version: number;
}

export interface HeartbeatResponse {
  server_time: string;
  config_version: number;
  config_changed: boolean;
  heartbeat_interval_sec: number;
  commands: DeviceCommand[];
}

export interface CommandAckRequest {
  status: "done" | "failed";
  detail?: string;
}

export interface TimingsBreakdown {
  transcribe_ms?: number;
  translate_ms?: number;
  synthesize_ms?: number;
  total_ms: number;
}

export interface AudioMetadata {
  url?: string;
  format: "pcm" | "mp3";
  sample_rate: number;
  duration_ms: number;
  expires_in?: number;
}

export interface UtteranceResponse {
  job_id: string;
  conversation_id: string;
  source_language: string;
  detected_language: string;
  target_language: string;
  transcript: string;
  translation: string;
  audio: AudioMetadata;
  timings: TimingsBreakdown;
}

export interface JobRecord {
  job_id: string;
  kind: JobKind;
  device_id?: string;
  conversation_id: string;
  status: JobStatus;
  source_language: string;
  detected_language?: string;
  target_language: string;
  transcript?: string;
  translation?: string;
  audio_input_url?: string;
  audio_output_url?: string;
  timings?: TimingsBreakdown;
  durations?: {
    audio_input_sec?: number;
    audio_output_sec?: number;
  };
  error?: ApiError;
  created_at: string;
  updated_at?: string;
}

export interface UploadRequest {
  filename: string;
  content_type: string;
}

export interface UploadResponse {
  job_id: string;
  upload_url: string;
  expires_in: number;
  max_size_mb: number;
}

export interface CreateJobRequest {
  job_id: string;
  source_language?: string;
  target_language: string;
  voice_id?: string;
}

export interface CreateJobResponse {
  job_id: string;
  status: JobStatus;
}

export interface DeviceSummary {
  device_id: string;
  status: "active" | "revoked";
  config_version: number;
  config: DeviceConfig;
  online: boolean;
  last_heartbeat?: {
    timestamp: string;
    firmware_version: string;
    rssi: number;
    free_heap: number;
    uptime_sec: number;
    battery_pct?: number;
  };
  created_at: string;
  updated_at?: string;
  device_key?: string; // Only returned on initial creation
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
  device_rate_limit_per_min: number;
  device_daily_quota: number;
  default_heartbeat_interval_sec: number;
  allowed_languages: string[];
  voice_map?: Record<string, string>;
}

export interface SystemStats {
  metadata: {
    query_cap: number;
    jobs_evaluated: number;
    window_hours_latency: number;
    window_days_jobs: number;
  };
  devices: {
    online: number;
    total: number;
  };
  jobs: {
    total: number;
    counts_by_status: Record<string, number>;
    counts_by_kind: Record<string, number>;
    failure_rate: number;
    jobs_per_day_30d: Array<{ date: string; count: number }>;
  };
  audio: {
    total_audio_minutes: number;
    top_language_pairs: Array<{ pair: string; count: number }>;
  };
  latencies_24h_ms: {
    total: { p50: number; p95: number; samples: number };
    transcribe: { p50: number; p95: number; samples: number };
    translate: { p50: number; p95: number; samples: number };
    synthesize: { p50: number; p95: number; samples: number };
  };
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    dynamodb: { status: string; table_status?: string };
    s3: { status: string; bucket?: string };
    translate: { status: string };
    polly: { status: string };
    transcribe: { status: string };
  };
  devices: {
    total: number;
    offline_count: number;
    offline_device_ids: string[];
  };
  last_failed_jobs: Array<{
    job_id: string;
    kind?: string;
    device_id?: string;
    created_at?: string;
    error?: ApiError;
  }>;
}
