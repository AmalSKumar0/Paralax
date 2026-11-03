import { Hono } from 'hono';
import crypto from 'crypto';
import { waitUntil } from '@vercel/functions';
import { deviceAuthMiddleware } from '../middleware/auth.js';
import { redis, DeviceRecord } from '../db/redis.js';
import { postgres } from '../db/postgres.js';
import { blob } from '../db/blob.js';
import { providerManager } from '../providers/index.js';
import {
  validateAndParseAudio,
  pcmToWav,
  encodeBase64Url,
  calculatePcmRms,
  AudioValidationError,
} from '../shared/audio.js';
import {
  validatePair,
  resolveTtsVoice,
  normalizeLocale,
  getLanguageInfo,
} from '../shared/languages.js';
import { ProviderRateLimitError, ProviderError } from '../providers/types.js';

export const deviceRoutes = new Hono<{
  Variables: {
    device: DeviceRecord;
  };
}>();

// All /device/* routes require valid X-Device-Key
deviceRoutes.use('*', deviceAuthMiddleware);

function safeWaitUntil(promise: Promise<any>): void {
  try {
    waitUntil(promise);
  } catch {
    promise.catch((err) => console.error('[Background Task Error]', err));
  }
}

/**
 * Match a detected language (code or name) against device configured languages A and B.
 */
function matchLanguage(detected: string, langA: string, langB: string): 'a' | 'b' | null {
  const normDetected = normalizeLocale(detected)?.toLowerCase() || detected.toLowerCase();
  const normA = normalizeLocale(langA)?.toLowerCase() || langA.toLowerCase();
  const normB = normalizeLocale(langB)?.toLowerCase() || langB.toLowerCase();

  // Exact or prefix match
  if (normDetected === normA || normDetected.split('-')[0] === normA.split('-')[0]) {
    return 'a';
  }
  if (normDetected === normB || normDetected.split('-')[0] === normB.split('-')[0]) {
    return 'b';
  }
  return null;
}

// -----------------------------------------------------------------------------
// POST /translate
// -----------------------------------------------------------------------------
deviceRoutes.post('/translate', async (c) => {
  const startTime = Date.now();
  const device = c.get('device');
  const idempotencyKey = c.req.header('idempotency-key') || c.req.header('Idempotency-Key');

  if (!idempotencyKey) {
    return c.json(
      {
        error: {
          code: 'missing_idempotency_key',
          message: 'Idempotency-Key header is required for device translation',
        },
      },
      400
    );
  }

  // 1. Idempotency Check
  const existingRecord = await redis.getIdempotencyRecord(device.id, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.status === 'in_progress') {
      return c.json(
        {
          error: {
            code: 'idempotent_in_progress',
            message: 'A translation with this idempotency key is already processing',
          },
        },
        409
      );
    }

    if (existingRecord.status === 'completed') {
      // Re-run TTS only! Never re-run STT or Translate.
      const targetLang = existingRecord.target_language;
      const voice = resolveTtsVoice(targetLang);
      const ttsStart = Date.now();
      const ttsRes = await providerManager.synthesize(existingRecord.translation, voice.voiceId, voice.provider);
      const synthMs = Date.now() - ttsStart;
      const totalMs = Date.now() - startTime;

      const acceptHeader = c.req.header('accept') || '';
      if (acceptHeader.includes('application/octet-stream')) {
        return new Response(ttsRes.audio, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Job-Id': existingRecord.job_id,
            'X-Source-Language': existingRecord.source_language,
            'X-Detected-Language': existingRecord.source_language,
            'X-Target-Language': targetLang,
            'X-Duration-Ms': String(ttsRes.durationMs),
            'X-STT-Ms': String((existingRecord as any).stt_ms || 0),
            'X-Translate-Ms': String(existingRecord.translate_ms || 0),
            'X-Synthesize-Ms': String(synthMs),
            'X-Total-Ms': String(totalMs),
            'X-Transcript': encodeBase64Url(existingRecord.transcript),
            'X-Translation': encodeBase64Url(existingRecord.translation),
          },
        });
      }

      return c.json({
        id: existingRecord.job_id,
        status: 'completed',
        source_language: existingRecord.source_language,
        target_language: targetLang,
        transcript: existingRecord.transcript,
        translation: existingRecord.translation,
        audio: {
          format: 'pcm',
          sample_rate: 16000,
          duration_ms: ttsRes.durationMs,
          base64: ttsRes.audio.toString('base64'),
        },
        duration_ms: ttsRes.durationMs,
        timings: {
          stt_ms: (existingRecord as any).stt_ms || 0,
          translate_ms: existingRecord.translate_ms || 0,
          synthesize_ms: synthMs,
          total_ms: totalMs,
        },
      });
    }
  }

  // 2. Mark Idempotency In-Progress
  await redis.setIdempotencyRecord(device.id, idempotencyKey, { status: 'in_progress' }, 300);

  // 3. Rate Limit & Daily Quota Checks
  const settings = await redis.getSettings();
  const rateLimitRes = await redis.checkAndIncrementRateLimit(device.id, settings.rate_limit_per_min || 20);
  if (!rateLimitRes.ok) {
    return c.json(
      {
        error: {
          code: 'device_rate_limited',
          message: 'Per-device rate limit exceeded. Please slow down.',
          retry_after_sec: rateLimitRes.retryAfterSec,
        },
      },
      429
    );
  }

  const quotaRes = await redis.checkAndIncrementDailyQuota(device.id, settings.daily_quota || 200);
  if (!quotaRes.ok) {
    return c.json(
      {
        error: {
          code: 'daily_quota_exceeded',
          message: 'Daily utterance quota exceeded for this device.',
          retry_after_sec: quotaRes.retryAfterSec,
        },
      },
      429
    );
  }

  // 4. Validate Audio Input
  const contentType = c.req.header('content-type') || 'audio/L16;rate=16000';
  const rawBody = Buffer.from(await c.req.arrayBuffer());

  if (rawBody.length > 4 * 1024 * 1024) {
    return c.json(
      {
        error: {
          code: 'audio_too_long',
          message: 'Audio payload exceeds maximum 4 MB size limit',
        },
      },
      413
    );
  }

  const maxUtteranceSec = Math.min(device.config?.max_utterance_sec || 15, 20);
  let parsedAudio;
  try {
    parsedAudio = validateAndParseAudio(rawBody, contentType, maxUtteranceSec);
  } catch (err: any) {
    if (err instanceof AudioValidationError) {
      return c.json({ error: { code: err.code, message: err.message } }, 422);
    }
    return c.json({ error: { code: 'invalid_audio_format', message: 'Could not parse audio bytes' } }, 400);
  }

  if (parsedAudio.isSilent) {
    return c.json(
      {
        error: {
          code: 'no_speech_detected',
          message: 'Audio signal contains no speech (silence)',
        },
      },
      422
    );
  }

  // 5. Determine Language Direction
  const querySource = c.req.query('source');
  const queryTarget = c.req.query('target');
  const dirHeader = c.req.header('x-direction')?.toLowerCase();
  let sourceLang: string = querySource || 'auto';
  let targetLang: string = queryTarget || device.config.language_b;

  if (!querySource) {
    if (dirHeader === 'a_to_b') {
      sourceLang = device.config.language_a;
      targetLang = device.config.language_b;
    } else if (dirHeader === 'b_to_a') {
      sourceLang = device.config.language_b;
      targetLang = device.config.language_a;
    } else if (device.config.mode === 'buttons') {
      // Mode is buttons but no direction header specified -> default a_to_b
      sourceLang = device.config.language_a;
      targetLang = device.config.language_b;
    } else {
      // Auto mode
      sourceLang = 'auto';
    }
  }

  // 6. Speech-to-Text
  const wavAudio = pcmToWav(parsedAudio.pcm, 16000, 1, 16);
  let sttRes;
  try {
    sttRes = await providerManager.speechToText(
      wavAudio,
      sourceLang !== 'auto' ? normalizeLocale(sourceLang) || undefined : undefined
    );
  } catch (err: any) {
    if (err instanceof ProviderRateLimitError) {
      return c.json({ error: { code: 'provider_rate_limited', message: err.message, retry_after_sec: err.retryAfterSec } }, 429);
    }
    return c.json({ error: { code: 'transcription_failed', message: err.message } }, 502);
  }

  // Silence/confidence checks on STT result
  const cleanedText = (sttRes.text || '').replace(/[^\p{L}\p{N}]+/gu, '').trim();
  if (!cleanedText || cleanedText.length === 0 || (sttRes.noSpeechProb && sttRes.noSpeechProb > 0.85)) {
    return c.json(
      {
        error: {
          code: 'no_speech_detected',
          message: 'Speech recognition detected no intelligible speech',
        },
      },
      422
    );
  }

  // Auto Language Detection Resolution
  if (sourceLang === 'auto') {
    const matched = matchLanguage(sttRes.detectedLanguage || '', device.config.language_a, device.config.language_b);
    if (matched === 'a') {
      sourceLang = device.config.language_a;
      targetLang = device.config.language_b;
    } else if (matched === 'b') {
      sourceLang = device.config.language_b;
      targetLang = device.config.language_a;
    } else {
      return c.json(
        {
          error: {
            code: 'low_confidence_language',
            message: `Detected language '${sttRes.detectedLanguage}' is neither configured language (${device.config.language_a} or ${device.config.language_b})`,
          },
        },
        422
      );
    }
  }

  // Validate Language Pair
  const pairValidation = validatePair(sourceLang, targetLang);
  if (!pairValidation.valid) {
    return c.json(
      {
        error: {
          code: 'unsupported_language_pair',
          message: pairValidation.reason || `Language pair ${sourceLang} -> ${targetLang} is not supported`,
        },
      },
      422
    );
  }

  // 7. Translation
  let transRes;
  try {
    transRes = await providerManager.translate(sttRes.text, sourceLang, targetLang);
  } catch (err: any) {
    if (err instanceof ProviderRateLimitError) {
      return c.json({ error: { code: 'provider_rate_limited', message: err.message, retry_after_sec: err.retryAfterSec } }, 429);
    }
    return c.json({ error: { code: 'translation_failed', message: err.message } }, 502);
  }

  // 8. Text-to-Speech
  const activeTtsChains = providerManager.getActiveChains().tts;
  const voice = resolveTtsVoice(targetLang, device.config.voice_map?.[targetLang], activeTtsChains);
  let ttsRes;
  try {
    ttsRes = await providerManager.synthesize(transRes.text, voice.voiceId, voice.provider);
  } catch (err: any) {
    if (err instanceof ProviderRateLimitError) {
      return c.json({ error: { code: 'provider_rate_limited', message: err.message, retry_after_sec: err.retryAfterSec } }, 429);
    }
    return c.json({ error: { code: 'all_providers_failed', message: err.message } }, 502);
  }

  const jobId = `job_${crypto.randomBytes(12).toString('hex')}`;
  const totalMs = Date.now() - startTime;

  // 9. Asynchronous Persistence via waitUntil
  safeWaitUntil(
    (async () => {
      let inputBlobPath: string | undefined;
      let outputBlobPath: string | undefined;

      if (settings.store_audio) {
        try {
          inputBlobPath = await blob.uploadAudio(wavAudio, 'original', jobId);
          outputBlobPath = await blob.uploadAudio(ttsRes.audio, 'translated', jobId);
        } catch (bErr) {
          console.warn('[Blob] Failed to store audio for job', jobId, bErr);
        }
      }

      // Group into conversation
      const conversationId = await postgres.touchConversation(
        device.id,
        device.config.conversation_idle_sec || 120
      );

      // Save Job
      await postgres.createJob({
        jobId,
        kind: 'utterance',
        deviceId: device.id,
        conversationId,
        status: 'completed',
        sourceLanguage: sourceLang,
        detectedLanguage: sttRes.detectedLanguage,
        targetLanguage: targetLang,
        transcript: sttRes.text,
        translation: transRes.text,
        audioInputBlobPath: inputBlobPath,
        audioOutputBlobPath: outputBlobPath,
        canRetry: Boolean(settings.store_audio && inputBlobPath),
        durationSec: parsedAudio.durationSec,
        sttMs: sttRes.latencyMs,
        translateMs: transRes.latencyMs,
        synthesizeMs: ttsRes.latencyMs,
        totalMs,
      });

      // Save Idempotency record (24 hours TTL)
      await redis.setIdempotencyRecord(
        device.id,
        idempotencyKey,
        {
          status: 'completed',
          job_id: jobId,
          source_language: sourceLang,
          target_language: targetLang,
          transcript: sttRes.text,
          translation: transRes.text,
          stt_ms: sttRes.latencyMs,
          translate_ms: transRes.latencyMs,
          synthesize_ms: ttsRes.latencyMs,
          total_ms: totalMs,
        },
        86400
      );

      // Record audio signal telemetry on utterance translation
      try {
        const rms = calculatePcmRms(parsedAudio.pcm);
        const audioLevel = Math.min(100, Math.round((rms / 16384) * 100));
        await redis.recordTelemetry(device.id, {
          ts: new Date().toISOString(),
          rssi: device.rssi,
          battery_pct: device.battery_pct,
          uptime_sec: device.uptime_sec,
          audio_level: audioLevel,
          mic_peak: Math.min(100, Math.round(audioLevel * 1.25)),
        });
      } catch (telemErr) {
        console.warn('[Telemetry] Failed to record audio telemetry:', telemErr);
      }
    })()
  );

  // 10. Format and Return Response
  const acceptHeader = c.req.header('accept') || '';
  if (acceptHeader.includes('application/octet-stream')) {
    return new Response(ttsRes.audio, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Job-Id': jobId,
        'X-Source-Language': sourceLang,
        'X-Detected-Language': normalizeLocale(sttRes.detectedLanguage || '') || sttRes.detectedLanguage || sourceLang,
        'X-Target-Language': targetLang,
        'X-Duration-Ms': String(ttsRes.durationMs),
        'X-STT-Ms': String(sttRes.latencyMs),
        'X-Translate-Ms': String(transRes.latencyMs),
        'X-Synthesize-Ms': String(ttsRes.latencyMs),
        'X-Total-Ms': String(totalMs),
        'X-Transcript': encodeBase64Url(sttRes.text),
        'X-Translation': encodeBase64Url(transRes.text),
      },
    });
  }

  return c.json({
    id: jobId,
    status: 'completed',
    source_language: sourceLang,
    detected_language: sttRes.detectedLanguage,
    target_language: targetLang,
    transcript: sttRes.text,
    translation: transRes.text,
    audio: {
      format: 'pcm',
      sample_rate: 16000,
      duration_ms: ttsRes.durationMs,
      base64: ttsRes.audio.toString('base64'),
    },
    duration_ms: ttsRes.durationMs,
    timings: {
      stt_ms: sttRes.latencyMs,
      translate_ms: transRes.latencyMs,
      synthesize_ms: ttsRes.latencyMs,
      total_ms: totalMs,
    },
  });
});

// -----------------------------------------------------------------------------
// POST /heartbeat
// -----------------------------------------------------------------------------
deviceRoutes.post('/heartbeat', async (c) => {
  const device = c.get('device');
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // Optional JSON body
  }

  const {
    firmware_version,
    rssi,
    battery_pct,
    uptime_sec,
    config_version,
    free_heap,
    audio_level,
    mic_peak,
    temperature,
    error_count,
    acked_commands,
  } = body;

  // If device acknowledged commands in heartbeat, mark them done in Redis
  if (Array.isArray(acked_commands)) {
    for (const cmdId of acked_commands) {
      if (typeof cmdId === 'string' && cmdId.length > 0) {
        await redis.ackCommand(device.id, cmdId, 'done');
      }
    }
  }

  // Check if device applied latest config
  let appliedVersion = device.applied_config_version;
  if (config_version !== undefined && config_version === device.config_version) {
    appliedVersion = config_version;
  }

  // Update hot state in Redis (heartbeat does NOT touch Postgres!)
  await redis.updateDeviceState(device.id, {
    firmware_version: firmware_version || device.firmware_version,
    rssi: rssi !== undefined ? rssi : device.rssi,
    battery_pct: battery_pct !== undefined ? battery_pct : device.battery_pct,
    uptime_sec: uptime_sec !== undefined ? uptime_sec : device.uptime_sec,
    applied_config_version: appliedVersion,
  });

  // Record telemetry sample into Redis ring buffer
  await redis.recordTelemetry(device.id, {
    ts: new Date().toISOString(),
    rssi: rssi !== undefined ? rssi : device.rssi,
    free_heap: free_heap !== undefined ? free_heap : undefined,
    battery_pct: battery_pct !== undefined ? battery_pct : device.battery_pct,
    uptime_sec: uptime_sec !== undefined ? uptime_sec : device.uptime_sec,
    audio_level: audio_level !== undefined ? audio_level : undefined,
    mic_peak: mic_peak !== undefined ? mic_peak : undefined,
    temperature: temperature !== undefined ? temperature : undefined,
    error_count: error_count !== undefined ? error_count : undefined,
  });

  const pendingCommands = await redis.getPendingCommands(device.id);

  return c.json({
    config_changed: appliedVersion !== device.config_version,
    config_up_to_date: appliedVersion === device.config_version,
    config_version: device.config_version,
    server_time: new Date().toISOString(),
    commands: pendingCommands,
    pending_commands: pendingCommands,
  });
});

// -----------------------------------------------------------------------------
// GET /config
// -----------------------------------------------------------------------------
deviceRoutes.get('/config', async (c) => {
  const device = c.get('device');
  return c.json({
    device_id: device.id,
    language_a: device.config.language_a,
    language_b: device.config.language_b,
    mode: device.config.mode,
    speech_rate_pct: device.config.speech_rate_pct ?? (device.config.tts_speed ? Math.round(device.config.tts_speed * 100) : 100),
    volume_pct: device.config.volume_pct ?? (device.config.volume ? Math.round(device.config.volume * 100) : 85),
    max_recording_sec: device.config.max_recording_sec ?? device.config.max_utterance_sec ?? 15,
    max_utterance_sec: device.config.max_utterance_sec ?? device.config.max_recording_sec ?? 15,
    heartbeat_interval_sec: device.config.heartbeat_interval_sec ?? 60,
    volume: device.config.volume,
    tts_speed: device.config.tts_speed,
    mic_gain: device.config.mic_gain,
    conversation_idle_sec: device.config.conversation_idle_sec ?? 120,
    sample_rate: 16000,
    bit_depth: 16,
    config_version: device.config_version,
  });
});

// -----------------------------------------------------------------------------
// POST /commands/:id/ack
// -----------------------------------------------------------------------------
deviceRoutes.post('/commands/:id/ack', async (c) => {
  const device = c.get('device');
  const commandId = c.req.param('id');
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // Defaults
  }

  const status = body.status === 'failed' ? 'failed' : 'done';
  const detail = body.detail;

  const acked = await redis.ackCommand(device.id, commandId, status, detail);
  if (!acked) {
    return c.json(
      {
        error: {
          code: 'command_not_found',
          message: `Command '${commandId}' was not found in pending queue`,
        },
      },
      404
    );
  }

  return c.json({ success: true, command_id: commandId, status });
});
