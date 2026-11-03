import { Hono } from 'hono';
import crypto from 'crypto';
import { redis, DeviceRecord, hashSecret } from '../../db/redis.js';
import { postgres } from '../../db/postgres.js';

export const adminDeviceRoutes = new Hono();

// Helper to calculate online status based on 5-minute threshold
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
function formatDeviceWithStatus(device: DeviceRecord) {
  const now = Date.now();
  const isOnline = Boolean(
    device.status === 'active' &&
    device.last_seen &&
    (now - new Date(device.last_seen).getTime() <= ONLINE_THRESHOLD_MS)
  );
  return {
    ...device,
    online: isOnline,
  };
}

// GET /admin/devices
adminDeviceRoutes.get('/', async (c) => {
  const devices = await redis.listDevices();
  return c.json({ devices: devices.map(formatDeviceWithStatus) });
});

// POST /admin/devices
adminDeviceRoutes.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'invalid_request', message: 'Invalid JSON' } }, 400);
  }

  const { name, config } = body || {};
  if (!name) {
    return c.json({ error: { code: 'validation_error', message: 'Device name is required' } }, 400);
  }

  const id = `dev_${crypto.randomBytes(8).toString('hex')}`;
  const rawKey = `key_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = hashSecret(rawKey);

  const deviceConfig = {
    language_a: config?.language_a || 'en-US',
    language_b: config?.language_b || 'es-US',
    mode: config?.mode === 'auto' ? ('auto' as const) : ('buttons' as const),
    max_utterance_sec: config?.max_utterance_sec || 15,
    volume: config?.volume !== undefined ? config.volume : 80,
    tts_speed: config?.tts_speed || 1.0,
    mic_gain: config?.mic_gain || 1.0,
    conversation_idle_sec: config?.conversation_idle_sec || 120,
    config_version: 1,
  };

  const deviceRecord: DeviceRecord = {
    id,
    device_id: id,
    name,
    key_hash: keyHash,
    status: 'active',
    created_at: new Date().toISOString(),
    config: deviceConfig,
    config_version: 1,
    applied_config_version: 0,
  };

  await redis.saveDevice(deviceRecord);

  return c.json(
    {
      device: formatDeviceWithStatus(deviceRecord),
      device_key: rawKey, // Only returned once upon creation!
    },
    201
  );
});

// GET /admin/devices/:id
adminDeviceRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const device = await redis.getDevice(id);
  if (!device) {
    return c.json({ error: { code: 'device_not_found', message: `Device '${id}' not found` } }, 404);
  }
  return c.json(formatDeviceWithStatus(device));
});

// PATCH /admin/devices/:id
adminDeviceRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const device = await redis.getDevice(id);
  if (!device) {
    return c.json({ error: { code: 'device_not_found', message: `Device '${id}' not found` } }, 404);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  if (body.name) device.name = body.name;
  if (body.status && ['active', 'revoked'].includes(body.status)) {
    device.status = body.status;
  }

  await redis.saveDevice(device);
  return c.json(device);
});

// DELETE /admin/devices/:id
adminDeviceRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const device = await redis.getDevice(id);
  if (!device) {
    return c.json({ error: { code: 'device_not_found', message: `Device '${id}' not found` } }, 404);
  }

  await redis.deleteDevice(id);
  return c.json({ success: true, message: `Device '${id}' deleted` });
});

// PUT /admin/devices/:id/config
adminDeviceRoutes.put('/:id/config', async (c) => {
  const id = c.req.param('id');
  const device = await redis.getDevice(id);
  if (!device) {
    return c.json({ error: { code: 'device_not_found', message: `Device '${id}' not found` } }, 404);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const newConfig = {
    ...device.config,
    ...body,
    config_version: (device.config_version || 1) + 1,
  };

  device.config = newConfig;
  device.config_version = newConfig.config_version;

  await redis.saveDevice(device);
  return c.json(device.config);
});

// POST /admin/devices/:id/rotate-key
adminDeviceRoutes.post('/:id/rotate-key', async (c) => {
  const id = c.req.param('id');
  const device = await redis.getDevice(id);
  if (!device) {
    return c.json({ error: { code: 'device_not_found', message: `Device '${id}' not found` } }, 404);
  }

  const rawKey = `key_${crypto.randomBytes(24).toString('hex')}`;
  device.key_hash = hashSecret(rawKey);
  await redis.saveDevice(device);

  return c.json({
    success: true,
    device_id: id,
    device_key: rawKey,
  });
});

// POST /admin/devices/:id/revoke
adminDeviceRoutes.post('/:id/revoke', async (c) => {
  const id = c.req.param('id');
  const device = await redis.getDevice(id);
  if (!device) {
    return c.json({ error: { code: 'device_not_found', message: `Device '${id}' not found` } }, 404);
  }

  device.status = 'revoked';
  await redis.saveDevice(device);

  return c.json({ success: true, message: `Device '${id}' has been revoked immediately` });
});

// GET /admin/devices/:id/commands
adminDeviceRoutes.get('/:id/commands', async (c) => {
  const id = c.req.param('id');
  const commands = await redis.listCommands(id);
  return c.json({ commands });
});

// POST /admin/devices/:id/commands
adminDeviceRoutes.post('/:id/commands', async (c) => {
  const id = c.req.param('id');
  const device = await redis.getDevice(id);
  if (!device) {
    return c.json({ error: { code: 'device_not_found', message: `Device '${id}' not found` } }, 404);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const cmdType = body.command_type || body.type;
  if (!cmdType || !['reboot', 'update_firmware', 'ping'].includes(cmdType)) {
    return c.json(
      {
        error: {
          code: 'invalid_command',
          message: "command_type must be one of: 'reboot', 'update_firmware', 'ping'",
        },
      },
      400
    );
  }

  const commandId = `cmd_${crypto.randomBytes(8).toString('hex')}`;
  const cmd = {
    id: commandId,
    device_id: id,
    type: cmdType,
    payload: body.payload || {},
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  };

  await redis.enqueueCommand(id, cmd);
  return c.json(cmd, 201);
});

// GET /admin/devices/:id/telemetry
adminDeviceRoutes.get('/:id/telemetry', async (c) => {
  const id = c.req.param('id');
  const range = c.req.query('range') || '24h';
  const samples = await redis.getTelemetry(id, range);
  return c.json({ samples });
});

// POST /admin/devices/:id/telemetry
adminDeviceRoutes.post('/:id/telemetry', async (c) => {
  const id = c.req.param('id');
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const sample = {
    ts: body.ts || new Date().toISOString(),
    battery_pct: body.battery_pct,
    rssi: body.rssi,
    free_heap: body.free_heap,
    temperature: body.temperature,
    error_count: body.error_count,
    audio_level: body.audio_level,
    mic_peak: body.mic_peak,
  };

  await redis.recordTelemetry(id, sample);
  return c.json({ success: true, sample }, 201);
});

// GET /admin/devices/:id/utterances
adminDeviceRoutes.get('/:id/utterances', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  const jobsResult = await postgres.listJobs({
    deviceId: id,
    kind: 'utterance',
    limit,
    cursor,
  });

  return c.json({
    items: jobsResult.items,
    next_cursor: jobsResult.next_cursor,
    total: jobsResult.items.length,
  });
});
