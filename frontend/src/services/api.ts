import { apiClient } from './apiClient';
import {
  AdminStats,
  ApiJob,
  ApiKey,
  Conversation,
  Device,
  DeviceCommand,
  DeviceConfig,
  Language,
  Settings,
  SystemHealth,
  TelemetrySample,
  CommandType,
} from '../types';

export const api = {
  // Stats
  getStats: () => apiClient.request<AdminStats>('/admin/stats'),

  // Health
  getHealth: () => apiClient.request<SystemHealth>('/admin/health'),

  // Settings
  getSettings: () => apiClient.request<Settings>('/admin/settings'),
  updateSettings: (settings: Partial<Settings>) =>
    apiClient.request<Settings>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // Languages
  getLanguages: () => apiClient.request<{ languages: Language[] }>('/languages'),

  // Devices
  getDevices: () => apiClient.request<Device[]>('/admin/devices'),
  getDevice: (id: string) => apiClient.request<Device>(`/admin/devices/${id}`),
  registerDevice: (data: {
    name: string;
    language_a: string;
    language_b: string;
    mode: 'buttons' | 'auto_detect';
    voice_map: Record<string, string>;
  }) =>
    apiClient.request<{ device: Device; device_key: string }>('/admin/devices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDeviceConfig: (id: string, config: Partial<DeviceConfig>) =>
    apiClient.request<Device>(`/admin/devices/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  rotateDeviceKey: (id: string) =>
    apiClient.request<{ device_key: string }>(`/admin/devices/${id}/rotate-key`, {
      method: 'POST',
    }),
  revokeDevice: (id: string) =>
    apiClient.request<{ success: boolean }>(`/admin/devices/${id}/revoke`, {
      method: 'POST',
    }),
  deleteDevice: (id: string) =>
    apiClient.request<{ success: boolean }>(`/admin/devices/${id}`, {
      method: 'DELETE',
    }),
  getDeviceCommands: (id: string) =>
    apiClient.request<DeviceCommand[]>(`/admin/devices/${id}/commands`),
  sendDeviceCommand: (id: string, type: CommandType) =>
    apiClient.request<DeviceCommand>(`/admin/devices/${id}/commands`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),
  getDeviceTelemetry: (id: string, range: '1h' | '6h' | '24h' | '7d') =>
    apiClient.request<{ samples: TelemetrySample[] }>(`/admin/devices/${id}/telemetry?range=${range}`),

  // Jobs
  getJobs: (params?: {
    status?: string;
    kind?: string;
    device_id?: string;
    language?: string;
    cursor?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.kind) sp.set('kind', params.kind);
    if (params?.device_id) sp.set('device_id', params.device_id);
    if (params?.language) sp.set('language', params.language);
    if (params?.cursor) sp.set('cursor', params.cursor);
    return apiClient.request<{ items: ApiJob[]; next_cursor?: string }>(`/admin/jobs?${sp.toString()}`);
  },
  getJob: (id: string) => apiClient.request<ApiJob>(`/jobs/${id}`),
  retryJob: (id: string) =>
    apiClient.request<ApiJob>(`/admin/jobs/${id}/retry`, { method: 'POST' }),
  cancelJob: (id: string) =>
    apiClient.request<ApiJob>(`/admin/jobs/${id}/cancel`, { method: 'POST' }),
  deleteJob: (id: string) =>
    apiClient.request<{ success: boolean }>(`/admin/jobs/${id}`, { method: 'DELETE' }),

  // Utterance Console
  sendUtterance: (params: { source: string; target: string; audioBlob: Blob; deviceId?: string }) => {
    const sp = new URLSearchParams({
      source: params.source,
      target: params.target,
      format: 'wav',
    });
    if (params.deviceId) sp.set('device_id', params.deviceId);
    return apiClient.request<{
      job_id: string;
      conversation_id: string;
      source_language: string;
      detected_language: string;
      target_language: string;
      transcript: string;
      translation: string;
      audio: { url: string; format: string; sample_rate: number; duration_ms: number; expires_in: number };
      timings: { transcribe_ms: number; translate_ms: number; synthesize_ms: number; total_ms: number };
    }>(`/utterances?${sp.toString()}`, {
      method: 'POST',
      body: params.audioBlob,
      headers: {
        'Content-Type': 'audio/wav',
      },
    });
  },

  // File Uploads
  createUploadUrl: (filename: string, contentType: string = 'audio/wav') =>
    apiClient.request<{ job_id: string; upload_url: string; expires_in: number }>('/uploads', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType }),
    }),
  startFileJob: (data: { job_id: string; source_language: string; target_language: string; voice_id?: string }) =>
    apiClient.request<ApiJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Conversations
  getConversations: (params?: { device_id?: string; search?: string; cursor?: string }) => {
    const sp = new URLSearchParams();
    if (params?.device_id) sp.set('device_id', params.device_id);
    if (params?.search) sp.set('search', params.search);
    if (params?.cursor) sp.set('cursor', params.cursor);
    return apiClient.request<{ items: Conversation[]; next_cursor?: string }>(
      `/admin/conversations?${sp.toString()}`
    );
  },
  getConversation: (id: string) =>
    apiClient.request<Conversation>(`/admin/conversations/${id}`),

  // API Keys
  getApiKeys: () => apiClient.request<ApiKey[]>('/admin/api-keys'),
  createApiKey: (name: string) =>
    apiClient.request<{ key: ApiKey; secret: string }>('/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteApiKey: (id: string) =>
    apiClient.request<{ success: boolean }>(`/admin/api-keys/${id}`, { method: 'DELETE' }),
};
