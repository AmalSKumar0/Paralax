import { apiClient, API_BASE_URL } from './apiClient';
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
  getDevices: async () => {
    const res = await apiClient.request<Device[] | { devices: Device[] }>('/admin/devices');
    const list = Array.isArray(res) ? res : (res?.devices || []);
    const now = Date.now();
    const thresholdMs = 5 * 60 * 1000;
    return list.map((d: any) => ({
      ...d,
      device_id: d.device_id || d.id,
      online: d.status === 'revoked' ? false : (d.last_seen ? (now - new Date(d.last_seen).getTime() <= thresholdMs) : Boolean(d.online)),
    }));
  },
  getDevice: async (id: string) => {
    const d = await apiClient.request<any>(`/admin/devices/${id}`);
    const now = Date.now();
    const thresholdMs = 5 * 60 * 1000;
    return {
      ...d,
      device_id: d.device_id || d.id,
      online: d.status === 'revoked' ? false : (d.last_seen ? (now - new Date(d.last_seen).getTime() <= thresholdMs) : Boolean(d.online)),
    } as Device;
  },
  registerDevice: async (data: {
    name: string;
    language_a: string;
    language_b: string;
    mode: 'buttons' | 'auto_detect';
    voice_map: Record<string, string>;
  }) => {
    const payload = {
      name: data.name,
      config: {
        language_a: data.language_a,
        language_b: data.language_b,
        mode: data.mode === 'auto_detect' ? 'auto' : 'buttons',
        voice_map: data.voice_map,
      },
    };
    const res = await apiClient.request<any>('/admin/devices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.device && res.device_key) {
      return res as { device: Device; device_key: string };
    }
    const dev: Device = {
      device_id: res.device_id || res.id,
      name: res.name || data.name,
      online: res.online ?? false,
      last_seen: res.last_seen || new Date().toISOString(),
      firmware_version: res.firmware_version || '1.0.0',
      rssi: res.rssi ?? -60,
      config_version: res.config_version || 1,
      applied_config_version: res.applied_config_version || res.config_version || 1,
      config: res.config || payload.config,
      created_at: res.created_at || new Date().toISOString(),
    };
    return { device: dev, device_key: res.device_key };
  },
  updateDeviceConfig: (id: string, config: Partial<DeviceConfig>) =>
    apiClient.request<DeviceConfig>(`/admin/devices/${id}/config`, {
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
  getDeviceCommands: async (id: string) => {
    const res = await apiClient.request<DeviceCommand[] | { commands: DeviceCommand[] }>(`/admin/devices/${id}/commands`);
    return Array.isArray(res) ? res : (res?.commands || []);
  },
  sendDeviceCommand: (id: string, type: CommandType) =>
    apiClient.request<DeviceCommand>(`/admin/devices/${id}/commands`, {
      method: 'POST',
      body: JSON.stringify({ command_type: type }),
    }),
  getDeviceTelemetry: (id: string, range: '1h' | '6h' | '24h' | '7d') =>
    apiClient.request<{ samples: TelemetrySample[] }>(`/admin/devices/${id}/telemetry?range=${range}`),
  getDeviceUtterances: async (id: string) => {
    const res = await apiClient.request<{ items: ApiJob[] }>(`/admin/devices/${id}/utterances`);
    return res.items || [];
  },

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
  getJob: (id: string) => apiClient.request<ApiJob>(`/admin/jobs/${id}`),
  retryJob: (id: string) =>
    apiClient.request<ApiJob>(`/admin/jobs/${id}/retry`, { method: 'POST' }),
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
      id: string;
      conversation_id?: string;
      source_language: string;
      detected_language?: string;
      target_language: string;
      transcript: string;
      translation: string;
      can_retry?: boolean;
      audio: { url?: string; base64?: string; format: string; sample_rate: number; duration_ms: number; expires_in?: number };
      timings: { stt_ms: number; translate_ms: number; synthesize_ms: number; total_ms: number };
    }>(`/utterances?${sp.toString()}`, {
      method: 'POST',
      body: params.audioBlob,
      headers: {
        'Content-Type': 'audio/wav',
      },
    });
  },

  // Direct File Upload with XHR Progress
  uploadFileUtterance: (params: {
    file: File | Blob;
    source?: string;
    target?: string;
    onProgress?: (pct: number) => void;
  }): Promise<{
    job_id: string;
    id: string;
    source_language: string;
    detected_language?: string;
    target_language: string;
    transcript: string;
    translation: string;
    can_retry?: boolean;
    audio: { url?: string; base64?: string; format: string; sample_rate: number; duration_ms: number };
    timings: { stt_ms: number; translate_ms: number; synthesize_ms: number; total_ms: number };
  }> => {
    return new Promise((resolve, reject) => {
      const sp = new URLSearchParams({
        kind: 'file',
        source: params.source || 'auto',
        target: params.target || 'es-US',
        format: 'wav',
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/utterances?${sp.toString()}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      if (params.onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            params.onProgress!(Math.round((e.loaded / e.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error?.message || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during file upload'));

      const formData = new FormData();
      formData.append('file', params.file);
      xhr.send(formData);
    });
  },

  // Conversations
  getConversations: async (params?: { device_id?: string; search?: string; cursor?: string }) => {
    const sp = new URLSearchParams();
    if (params?.device_id) sp.set('device_id', params.device_id);
    if (params?.search) sp.set('search', params.search);
    if (params?.cursor) sp.set('cursor', params.cursor);
    const res = await apiClient.request<any>(`/admin/conversations?${sp.toString()}`);
    const items = res?.conversations || res?.items || (Array.isArray(res) ? res : []);
    return { items, next_cursor: res?.next_cursor };
  },
  getConversation: (id: string) =>
    apiClient.request<Conversation>(`/admin/conversations/${id}`),

  // API Keys
  getApiKeys: async () => {
    const res = await apiClient.request<ApiKey[] | { api_keys: ApiKey[] }>('/admin/api-keys');
    return Array.isArray(res) ? res : (res?.api_keys || []);
  },
  createApiKey: (name: string) =>
    apiClient.request<{ key: ApiKey; secret: string }>('/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteApiKey: (id: string) =>
    apiClient.request<{ success: boolean }>(`/admin/api-keys/${id}`, { method: 'DELETE' }),
};
