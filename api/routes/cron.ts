import { Hono } from 'hono';
import { redis } from '../db/redis.js';
import { postgres } from '../db/postgres.js';
import { blob } from '../db/blob.js';

export const cronRoutes = new Hono();

const handleRetention = async (c: any) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = c.req.header('authorization') || c.req.header('Authorization');
    const xCronSecret = c.req.header('x-cron-secret') || c.req.header('X-Cron-Secret');

    const expectedBearer = `Bearer ${cronSecret}`;
    if (authHeader !== expectedBearer && xCronSecret !== cronSecret) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Unauthorized cron request. Invalid or missing CRON_SECRET.',
          },
        },
        401
      );
    }
  }

  const settings = await redis.getSettings();
  const retentionDays = settings.retention_days || 30;

  console.log(`[Cron Retention] Cleaning up jobs older than ${retentionDays} days...`);
  const { deletedCount, blobPaths } = await postgres.deleteExpiredJobs(retentionDays);

  let deletedBlobsCount = 0;
  for (const blobPath of blobPaths) {
    try {
      await blob.deleteAudio(blobPath);
      deletedBlobsCount++;
    } catch (err) {
      console.warn(`[Cron Retention] Failed to delete blob ${blobPath}:`, err);
    }
  }

  console.log(`[Cron Retention] Deleted ${deletedCount} jobs and ${deletedBlobsCount} blobs.`);

  return c.json({
    success: true,
    retention_days: retentionDays,
    deleted_jobs: deletedCount,
    deleted_blobs: deletedBlobsCount,
    timestamp: new Date().toISOString(),
  });
};

cronRoutes.get('/retention', handleRetention);
cronRoutes.post('/retention', handleRetention);
