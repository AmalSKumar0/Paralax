import { Hono } from 'hono';
import crypto from 'crypto';
import { redis, ApiKeyRecord, hashSecret } from '../../db/redis.js';

export const adminApiKeyRoutes = new Hono();

// GET /admin/api-keys
adminApiKeyRoutes.get('/', async (c) => {
  const keys = await redis.listApiKeys();
  return c.json({ api_keys: keys });
});

// POST /admin/api-keys
adminApiKeyRoutes.post('/', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'invalid_request', message: 'Invalid JSON' } }, 400);
  }

  const name = body?.name || 'Machine API Key';
  const id = `key_${crypto.randomBytes(8).toString('hex')}`;
  const rawSecret = `paralax_sk_${crypto.randomBytes(24).toString('hex')}`;
  const keyPrefix = rawSecret.slice(0, 15);
  const keyHash = hashSecret(rawSecret);

  const keyRecord: ApiKeyRecord = {
    id,
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  await redis.createApiKey(keyRecord);

  return c.json(
    {
      key: keyRecord,
      secret: rawSecret, // Only returned once!
    },
    201
  );
});

// DELETE /admin/api-keys/:id
adminApiKeyRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await redis.deleteApiKey(id);
  return c.json({ success: true, message: `API Key '${id}' deleted` });
});
