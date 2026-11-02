import { authService } from './authService';
import { mockBackend } from './mockBackend';

// Helper to normalize backend base URL from VITE_API_BASE_URL
export function normalizeBaseUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) {
    return '/api/v1';
  }
  let clean = rawUrl.trim().replace(/\/+$/, '');
  if (clean === '/v1' || clean === '/api') {
    return '/api/v1';
  }
  if (!clean.includes('/api/v1')) {
    if (clean.endsWith('/api')) {
      clean = `${clean}/v1`;
    } else if (clean.endsWith('/v1')) {
      clean = clean.replace(/\/v1$/, '/api/v1');
    } else {
      clean = `${clean}/api/v1`;
    }
  }
  return clean;
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
export const IS_MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

// Custom event to notify app of service disabled banner on 503
export const SERVICE_DISABLED_EVENT = 'paralax:service_disabled';

export class ApiError extends Error {
  public code: string;
  public status: number;
  public retryAfterSec?: number;

  constructor(code: string, message: string, status: number = 400, retryAfterSec?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const session = authService.getSession();
    const headers = new Headers(options.headers || {});

    // Send CSRF header required for state-changing admin calls
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (session?.token) {
      headers.set('Authorization', `Bearer ${session.token}`);
    }

    if (!headers.has('Content-Type') && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }

    // In Mock Mode, route directly to simulated backend
    if (IS_MOCK_MODE) {
      return this.handleMockRequest<T>(endpoint, options);
    }

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // Same-origin cookie credentials
      });
    } catch {
      // Fallback to mock if real backend is unreachable in dev
      console.warn(`[paralax API] Real backend unreachable at ${url}, falling back to mock mode.`);
      return this.handleMockRequest<T>(endpoint, options);
    }

    if (response.status === 401) {
      authService.logout();
      window.location.href = '/login';
      throw new ApiError('unauthorized', 'Session expired or required. Please log in.', 401);
    }

    if (response.status === 503) {
      window.dispatchEvent(new CustomEvent(SERVICE_DISABLED_EVENT));
      throw new ApiError('service_disabled', 'The voice translator service is currently disabled by administrator.', 503);
    }

    if (!response.ok) {
      let errData: { error?: { code?: string; message?: string; retry_after_sec?: number } } = {};
      try {
        errData = await response.json();
      } catch {
        // Ignored
      }
      const code = errData.error?.code || 'internal_error';
      const message = errData.error?.message || response.statusText || 'Request failed';
      throw new ApiError(code, message, response.status, errData.error?.retry_after_sec);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // --- Mock Router ---
  private async handleMockRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await new Promise((r) => setTimeout(r, 60));

    const method = (options.method || 'GET').toUpperCase();
    const url = new URL(endpoint, 'http://localhost');
    const path = url.pathname;
    const searchParams = url.searchParams;

    if (!mockBackend.settings.service_enabled && path.startsWith('/utterances')) {
      window.dispatchEvent(new CustomEvent(SERVICE_DISABLED_EVENT));
      throw new ApiError('service_disabled', 'The voice translator service is currently disabled by administrator.', 503);
    }

    // 1. /utterances
    if (path === '/utterances' && method === 'POST') {
      const source = searchParams.get('source') || 'en-US';
      const target = searchParams.get('target') || 'es-ES';
      const kind = searchParams.get('kind') || 'utterance';
      let audioBlob: Blob;

      if (options.body instanceof FormData) {
        audioBlob = (options.body.get('file') || options.body.get('audio')) as Blob;
      } else {
        audioBlob = options.body as Blob;
      }

      const result = mockBackend.processUtterance({
        sourceLanguage: source,
        targetLanguage: target,
        audioBlob,
        kind: kind as 'utterance' | 'file',
      });
      return result as unknown as T;
    }

    // 2. /languages
    if (path === '/languages' && method === 'GET') {
      return { languages: mockBackend.languages } as unknown as T;
    }

    // 3. /admin/jobs
    if (path === '/admin/jobs' && method === 'GET') {
      const status = searchParams.get('status');
      const kind = searchParams.get('kind');
      const deviceId = searchParams.get('device_id');
      const language = searchParams.get('language');

      let items = [...mockBackend.jobs];
      if (status && status !== 'all') items = items.filter((j) => j.status === status);
      if (kind && kind !== 'all') items = items.filter((j) => j.kind === kind);
      if (deviceId) items = items.filter((j) => j.device_id === deviceId);
      if (language) items = items.filter((j) => j.source_language === language || j.target_language === language);

      return { items, next_cursor: undefined } as unknown as T;
    }

    const jobRetryMatch = path.match(/^\/admin\/jobs\/([^/]+)\/retry$/);
    if (jobRetryMatch && method === 'POST') {
      return mockBackend.retryJob(jobRetryMatch[1]) as unknown as T;
    }

    const jobDeleteMatch = path.match(/^\/admin\/jobs\/([^/]+)$/);
    if (jobDeleteMatch && method === 'DELETE') {
      mockBackend.deleteJob(jobDeleteMatch[1]);
      return { success: true } as unknown as T;
    }

    // 4. /admin/conversations
    if (path === '/admin/conversations' && method === 'GET') {
      return mockBackend.getConversations({
        deviceId: searchParams.get('device_id') || undefined,
        search: searchParams.get('search') || undefined,
      }) as unknown as T;
    }

    const convDetailMatch = path.match(/^\/admin\/conversations\/([^/]+)$/);
    if (convDetailMatch && method === 'GET') {
      const conv = mockBackend.getConversation(convDetailMatch[1]);
      if (!conv) throw new ApiError('conversation_not_found', 'Conversation not found', 404);
      return conv as unknown as T;
    }

    // 5. /admin/devices
    if (path === '/admin/devices') {
      if (method === 'GET') {
        return mockBackend.getDevices() as unknown as T;
      }
      if (method === 'POST') {
        const body = JSON.parse((options.body as string) || '{}');
        return mockBackend.registerDevice(body) as unknown as T;
      }
    }

    const deviceDetailMatch = path.match(/^\/admin\/devices\/([^/]+)$/);
    if (deviceDetailMatch) {
      const devId = deviceDetailMatch[1];
      if (method === 'GET') {
        const dev = mockBackend.getDevice(devId);
        if (!dev) throw new ApiError('device_not_found', 'Device not found', 404);
        return dev as unknown as T;
      }
      if (method === 'DELETE') {
        mockBackend.deleteDevice(devId);
        return { success: true } as unknown as T;
      }
    }

    const deviceConfigMatch = path.match(/^\/admin\/devices\/([^/]+)\/config$/);
    if (deviceConfigMatch && method === 'PUT') {
      const body = JSON.parse((options.body as string) || '{}');
      return mockBackend.updateDeviceConfig(deviceConfigMatch[1], body) as unknown as T;
    }

    const deviceRotateKeyMatch = path.match(/^\/admin\/devices\/([^/]+)\/rotate-key$/);
    if (deviceRotateKeyMatch && method === 'POST') {
      const newKey = mockBackend.rotateDeviceKey(deviceRotateKeyMatch[1]);
      return { device_key: newKey } as unknown as T;
    }

    const deviceRevokeMatch = path.match(/^\/admin\/devices\/([^/]+)\/revoke$/);
    if (deviceRevokeMatch && method === 'POST') {
      mockBackend.revokeDevice(deviceRevokeMatch[1]);
      return { success: true } as unknown as T;
    }

    const deviceCommandsMatch = path.match(/^\/admin\/devices\/([^/]+)\/commands$/);
    if (deviceCommandsMatch) {
      const devId = deviceCommandsMatch[1];
      if (method === 'GET') {
        return mockBackend.getDeviceCommands(devId) as unknown as T;
      }
      if (method === 'POST') {
        const body = JSON.parse((options.body as string) || '{}');
        return mockBackend.sendDeviceCommand(devId, body.type) as unknown as T;
      }
    }

    const deviceTelemetryMatch = path.match(/^\/admin\/devices\/([^/]+)\/telemetry$/);
    if (deviceTelemetryMatch && method === 'GET') {
      const range = (searchParams.get('range') || '24h') as '1h' | '6h' | '24h' | '7d';
      const samples = mockBackend.getDeviceTelemetry(deviceTelemetryMatch[1], range);
      return { samples } as unknown as T;
    }

    // 6. /admin/settings
    if (path === '/admin/settings') {
      if (method === 'GET') {
        return mockBackend.settings as unknown as T;
      }
      if (method === 'PUT') {
        const body = JSON.parse((options.body as string) || '{}');
        mockBackend.settings = { ...mockBackend.settings, ...body };
        return mockBackend.settings as unknown as T;
      }
    }

    // 7. /admin/stats
    if (path === '/admin/stats' && method === 'GET') {
      return mockBackend.getStats() as unknown as T;
    }

    // 8. /admin/health
    if (path === '/admin/health' && method === 'GET') {
      return mockBackend.getHealth() as unknown as T;
    }

    // 9. /admin/api-keys
    if (path === '/admin/api-keys') {
      if (method === 'GET') {
        return mockBackend.apiKeys as unknown as T;
      }
      if (method === 'POST') {
        const body = JSON.parse((options.body as string) || '{}');
        return mockBackend.createApiKey(body.name || 'API Client') as unknown as T;
      }
    }

    const apiKeyDeleteMatch = path.match(/^\/admin\/api-keys\/([^/]+)$/);
    if (apiKeyDeleteMatch && method === 'DELETE') {
      mockBackend.revokeApiKey(apiKeyDeleteMatch[1]);
      return { success: true } as unknown as T;
    }

    throw new ApiError('endpoint_not_found', `Mock endpoint ${method} ${path} not implemented`, 404);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
