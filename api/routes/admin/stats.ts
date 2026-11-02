import { Hono } from 'hono';
import { postgres } from '../../db/postgres.js';
import { redis } from '../../db/redis.js';

export const adminStatsRoutes = new Hono();

adminStatsRoutes.get('/', async (c) => {
  const analytics = await postgres.getStatsAnalytics();
  const devices = await redis.listDevices();

  const now = Date.now();
  // A device is considered online if seen within last 5 minutes (300s)
  const onlineThresholdMs = 5 * 60 * 1000;
  const devicesOnline = devices.filter(
    (d) => d.status === 'active' && d.last_seen && now - new Date(d.last_seen).getTime() <= onlineThresholdMs
  ).length;

  return c.json({
    ...analytics,
    devices_online: devicesOnline,
    devices_total: devices.length,
  });
});
