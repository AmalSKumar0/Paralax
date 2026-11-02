import { Hono } from 'hono';
import { redis, SettingsRecord } from '../../db/redis.js';
import { providerManager } from '../../providers/index.js';

export const adminSettingsRoutes = new Hono();

// GET /admin/settings
adminSettingsRoutes.get('/', async (c) => {
  const settings = await redis.getSettings();

  const providerInfo = {
    stt_chains: (process.env.STT_PROVIDERS || 'groq,xai').split(',').map((s) => s.trim()),
    translate_chains: (process.env.TRANSLATE_PROVIDERS || 'groq,xai').split(',').map((s) => s.trim()),
    tts_chains: (process.env.TTS_PROVIDERS || 'edge,xai').split(',').map((s) => s.trim()),
    allow_paid_fallback: process.env.ALLOW_PAID_FALLBACK === 'true',
    models: {
      groq_stt_model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
      groq_chat_model: process.env.GROQ_TRANSLATE_MODEL || 'llama-3.3-70b-versatile',
      xai_chat_model: process.env.XAI_TRANSLATE_MODEL || 'grok-2-latest',
    },
    call_counts: providerManager.getStats(),
  };

  return c.json({
    ...settings,
    providers: providerInfo,
  });
});

// PUT /admin/settings
adminSettingsRoutes.put('/', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'invalid_request', message: 'Invalid JSON' } }, 400);
  }

  // Remove read-only properties if provided in body
  delete body.providers;
  delete body.created_at;
  delete body.updated_at;

  const updated = await redis.updateSettings(body);

  const providerInfo = {
    stt_chains: (process.env.STT_PROVIDERS || 'groq,xai').split(',').map((s) => s.trim()),
    translate_chains: (process.env.TRANSLATE_PROVIDERS || 'groq,xai').split(',').map((s) => s.trim()),
    tts_chains: (process.env.TTS_PROVIDERS || 'edge,xai').split(',').map((s) => s.trim()),
    allow_paid_fallback: process.env.ALLOW_PAID_FALLBACK === 'true',
    models: {
      groq_stt_model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
      groq_chat_model: process.env.GROQ_TRANSLATE_MODEL || 'llama-3.3-70b-versatile',
      xai_chat_model: process.env.XAI_TRANSLATE_MODEL || 'grok-2-latest',
    },
    call_counts: providerManager.getStats(),
  };

  return c.json({
    ...updated,
    providers: providerInfo,
  });
});
