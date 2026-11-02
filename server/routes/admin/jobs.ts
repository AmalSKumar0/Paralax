import { Hono } from 'hono';
import { postgres } from '../../db/postgres.js';
import { blob } from '../../db/blob.js';
import { providerManager } from '../../providers/index.js';
import { resolveTtsVoice } from '../../shared/languages.js';
import { pcmToWav } from '../../shared/audio.js';

export const adminJobRoutes = new Hono();

// GET /admin/jobs
adminJobRoutes.get('/', async (c) => {
  const deviceId = c.req.query('device_id');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const cursor = c.req.query('cursor');

  const jobsResult = await postgres.listJobs({
    deviceId,
    status,
    limit,
    cursor,
  });

  return c.json({
    jobs: jobsResult.items,
    items: jobsResult.items,
    total: jobsResult.items.length,
    next_cursor: jobsResult.next_cursor,
    limit,
    offset,
  });
});

// GET /admin/jobs/:id
adminJobRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const job = await postgres.getJob(id);
  if (!job) {
    return c.json({ error: { code: 'job_not_found', message: `Job '${id}' not found` } }, 404);
  }
  return c.json(job);
});

// POST /admin/jobs/:id/retry
adminJobRoutes.post('/:id/retry', async (c) => {
  const id = c.req.param('id');
  const job = await postgres.getJob(id);
  if (!job) {
    return c.json({ error: { code: 'job_not_found', message: `Job '${id}' not found` } }, 404);
  }

  if (!job.canRetry || !job.audioInputBlobPath) {
    return c.json(
      {
        error: {
          code: 'cannot_retry',
          message: 'Job cannot be retried because original audio was not stored (store_audio was false)',
        },
      },
      400
    );
  }

  // Download input audio
  const inputAudio = await blob.downloadAudio(job.audioInputBlobPath);
  if (!inputAudio) {
    return c.json(
      {
        error: {
          code: 'audio_not_found',
          message: 'Original audio blob not found in storage',
        },
      },
      404
    );
  }

  const startTime = Date.now();

  // Re-run STT
  const sttRes = await providerManager.speechToText(inputAudio, job.sourceLanguage);

  // Re-run Translation
  const transRes = await providerManager.translate(sttRes.text, job.sourceLanguage, job.targetLanguage);

  // Re-run TTS
  const voice = resolveTtsVoice(job.targetLanguage);
  const ttsRes = await providerManager.synthesize(transRes.text, voice.voiceId, voice.provider);

  const totalMs = Date.now() - startTime;

  // Re-upload translated audio
  let outputBlobPath: string | undefined;
  try {
    outputBlobPath = await blob.uploadAudio(ttsRes.audio, 'translated', job.jobId);
  } catch (err) {
    console.warn('[Blob] Failed to update translated audio blob:', err);
  }

  const updated = await postgres.updateJob(job.jobId, {
    status: 'completed',
    transcript: sttRes.text,
    translation: transRes.text,
    audioOutputBlobPath: outputBlobPath || job.audioOutputBlobPath,
    sttMs: sttRes.latencyMs,
    translateMs: transRes.latencyMs,
    synthesizeMs: ttsRes.latencyMs,
    totalMs,
  });

  return c.json(updated);
});

// DELETE /admin/jobs/:id
adminJobRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const job = await postgres.getJob(id);
  if (!job) {
    return c.json({ error: { code: 'job_not_found', message: `Job '${id}' not found` } }, 404);
  }

  if (job.audioInputBlobPath) {
    await blob.deleteAudio(job.audioInputBlobPath);
  }
  if (job.audioOutputBlobPath) {
    await blob.deleteAudio(job.audioOutputBlobPath);
  }

  await postgres.deleteJob(id);
  return c.json({ success: true, message: `Job '${id}' deleted` });
});

// GET /admin/jobs/:id/audio/:type (type: original | translated)
adminJobRoutes.get('/:id/audio/:type', async (c) => {
  const id = c.req.param('id');
  const type = c.req.param('type');

  if (type !== 'original' && type !== 'translated') {
    return c.json({ error: { code: 'invalid_audio_type', message: "Type must be 'original' or 'translated'" } }, 400);
  }

  const job = await postgres.getJob(id);
  if (!job) {
    return c.json({ error: { code: 'job_not_found', message: `Job '${id}' not found` } }, 404);
  }

  const blobPath = type === 'original' ? job.audioInputBlobPath : job.audioOutputBlobPath;
  if (!blobPath) {
    return c.json(
      {
        error: {
          code: 'audio_not_found',
          message: `No ${type} audio was stored for this job`,
        },
      },
      404
    );
  }

  const audioBytes = await blob.downloadAudio(blobPath);
  if (!audioBytes) {
    return c.json(
      {
        error: {
          code: 'audio_not_found',
          message: `Audio file could not be retrieved from storage`,
        },
      },
      404
    );
  }

  // Format as playable WAV if it's raw PCM
  let responseBytes = audioBytes;
  if (audioBytes.length >= 4 && audioBytes.toString('ascii', 0, 4) !== 'RIFF') {
    responseBytes = pcmToWav(audioBytes, 16000, 1, 16);
  }

  return new Response(responseBytes, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(responseBytes.length),
      'Cache-Control': 'private, no-cache',
    },
  });
});
