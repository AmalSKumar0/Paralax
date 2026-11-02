import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/device.js';
import { utteranceRoutes } from './routes/utterances.js';
import { languageRoutes } from './routes/languages.js';
import { cronRoutes } from './routes/cron.js';

import { adminAuthMiddleware } from './middleware/auth.js';
import { adminDeviceRoutes } from './routes/admin/devices.js';
import { adminJobRoutes } from './routes/admin/jobs.js';
import { adminConversationRoutes } from './routes/admin/conversations.js';
import { adminSettingsRoutes } from './routes/admin/settings.js';
import { adminStatsRoutes } from './routes/admin/stats.js';
import { adminHealthRoutes } from './routes/admin/health.js';
import { adminApiKeyRoutes } from './routes/admin/apiKeys.js';

export const app = new Hono();

// Global Logger
app.use('*', logger());

// Global CORS configuration
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-Key',
      'x-device-key',
      'Idempotency-Key',
      'idempotency-key',
      'X-Requested-With',
      'x-requested-with',
      'X-Direction',
      'x-direction',
      'X-Api-Key',
      'x-api-key',
      'X-Cron-Secret',
      'x-cron-secret',
    ],
    exposeHeaders: [
      'X-Job-Id',
      'X-Source-Language',
      'X-Target-Language',
      'X-Duration-Ms',
      'X-STT-Ms',
      'X-Translate-Ms',
      'X-Synthesize-Ms',
      'X-Total-Ms',
      'X-Transcript',
      'X-Translation',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  })
);

// Global Error Handler
app.onError((err, c) => {
  console.error('[Unhandled Error]', err);
  const status = (err as any).status || 500;
  return c.json(
    {
      error: {
        code: (err as any).code || 'internal_error',
        message: err.message || 'An unexpected error occurred',
      },
    },
    status
  );
});

// Liveness Probes
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/v1/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// v1 API Sub-router
const v1 = new Hono();

// Auth Routes (login, logout, me)
v1.route('/auth', authRoutes);

// Public Language Registry
v1.route('/languages', languageRoutes);

// Device Routes (translate, heartbeat, config, commands ack)
v1.route('/device', deviceRoutes);

// Utterance Routes (dashboard mic & file upload)
v1.route('/utterances', utteranceRoutes);

// Admin Routes (all secured with adminAuthMiddleware)
const admin = new Hono();
admin.use('*', adminAuthMiddleware);
admin.route('/devices', adminDeviceRoutes);
admin.route('/jobs', adminJobRoutes);
admin.route('/conversations', adminConversationRoutes);
admin.route('/settings', adminSettingsRoutes);
admin.route('/stats', adminStatsRoutes);
admin.route('/health', adminHealthRoutes);
admin.route('/api-keys', adminApiKeyRoutes);

v1.route('/admin', admin);

// Mount under /api/v1 (and /v1 as alias)
app.route('/api/v1', v1);
app.route('/v1', v1);

// Mount Cron routes
app.route('/api/cron', cronRoutes);
app.route('/cron', cronRoutes);

// Catch-all 404 for unmapped API routes
app.all('*', (c) => {
  return c.json(
    {
      error: {
        code: 'not_found',
        message: `Endpoint not found: ${c.req.method} ${c.req.path}`,
      },
    },
    404
  );
});

// Export Vercel serverless function handlers
export default handle(app);
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
