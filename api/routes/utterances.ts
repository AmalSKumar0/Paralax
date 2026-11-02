import { Hono } from 'hono';
import crypto from 'crypto';
import { waitUntil } from '@vercel/functions';
import { utteranceAuthMiddleware } from '../middleware/auth.js';
import { redis } from '../db/redis.js';
import { postgres } from '../db/postgres.js';
import { blob } from '../db/blob.js';
import { providerManager } from '../providers/index.js';
import {
  pcmToWav,
  validateAndParseAudio,
  AudioValidationError,
} from '../shared/audio.js';
import {
  validatePair,
  resolveTtsVoice,
  normalizeLocale,
} from '../shared/languages.js';
import { ProviderRateLimitError } from '../providers/types.js';

export const utteranceRoutes = new Hono();

// Auth: either admin session or x-api-key
utteranceRoutes.use('*', utteranceAuthMiddleware);

function safeWaitUntil(promise: Promise<any>): void {
  try {
    waitUntil(promise);
  } catch {
    promise.catch((err) => console.error('[Background Utterance Error]', err));
  }
}

utteranceRoutes.post('/', async (c) => {
  const startTime = Date.now();
  const kind = c.req.query('kind') === 'file' ? 'file' : 'utterance';
  const querySource = c.req.query('source') || c.req.query('source_language') || 'auto';
  const queryTarget = c.req.query('target') || c.req.query('target_language') || 'es-US';
  const queryFormat = c.req.query('format') || 'wav';
  const queryDeviceId = c.req.query('device_id');

  const contentType = c.req.header('content-type') || '';
  let audioBuffer: Buffer;
  let sourceLang = querySource;
  let targetLang = queryTarget;
  let deviceId = queryDeviceId;

  // Handle multipart/form-data or raw body
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = (formData.get('file') || formData.get('audio')) as File | null;
    if (!file) {
      return c.json(
        {
          error: {
            code: 'invalid_audio_format',
            message: 'Multipart form must include an audio or file field',
          },
        },
        400
      );
    }

    const formSource = formData.get('source') || formData.get('source_language');
    const formTarget = formData.get('target') || formData.get('target_language');
    const formDevId = formData.get('device_id');

    if (formSource && typeof formSource === 'string') sourceLang = formSource;
    if (formTarget && typeof formTarget === 'string') targetLang = formTarget;
    if (formDevId && typeof formDevId === 'string') deviceId = formDevId;

    audioBuffer = Buffer.from(await file.arrayBuffer());
  } else {
    // Raw binary body
    audioBuffer = Buffer.from(await c.req.arrayBuffer());
  }

  // 4 MB body cap
  if (audioBuffer.length > 4 * 1024 * 1024) {
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

  if (audioBuffer.length === 0) {
    return c.json(
      {
        error: {
          code: 'invalid_audio_format',
          message: 'Audio buffer is empty',
        },
      },
      400
    );
  }

  // Detect format
  let wavAudioForStt: Buffer;
  let durationSec = 0;

  const isWav = audioBuffer.length >= 44 && audioBuffer.toString('ascii', 0, 4) === 'RIFF';
  const isMp3 = audioBuffer.length >= 3 && (
    (audioBuffer[0] === 0xff && (audioBuffer[1] & 0xe0) === 0xe0) ||
    audioBuffer.toString('ascii', 0, 3) === 'ID3'
  );

  if (isWav) {
    try {
      const parsed = validateAndParseAudio(audioBuffer, 'audio/wav', 30);
      if (parsed.isSilent) {
        return c.json({ error: { code: 'no_speech_detected', message: 'Audio contains no speech' } }, 422);
      }
      durationSec = parsed.durationSec;
      wavAudioForStt = audioBuffer;
    } catch (err: any) {
      if (err instanceof AudioValidationError) {
        return c.json({ error: { code: err.code, message: err.message } }, 422);
      }
      wavAudioForStt = audioBuffer;
    }
  } else if (isMp3 || contentType.includes('audio/mp3') || contentType.includes('audio/mpeg')) {
    // Whisper natively accepts MP3
    wavAudioForStt = audioBuffer;
  } else {
    // Treat as raw PCM (L16 16kHz mono)
    try {
      const parsed = validateAndParseAudio(audioBuffer, 'audio/L16;rate=16000', 30);
      if (parsed.isSilent) {
        return c.json({ error: { code: 'no_speech_detected', message: 'Audio contains no speech' } }, 422);
      }
      durationSec = parsed.durationSec;
      wavAudioForStt = pcmToWav(parsed.pcm, 16000, 1, 16);
    } catch (err: any) {
      if (err instanceof AudioValidationError) {
        return c.json({ error: { code: err.code, message: err.message } }, 422);
      }
      wavAudioForStt = pcmToWav(audioBuffer, 16000, 1, 16);
    }
  }

  // STT
  let sttRes;
  try {
    sttRes = await providerManager.speechToText(
      wavAudioForStt,
      sourceLang !== 'auto' ? normalizeLocale(sourceLang) || undefined : undefined
    );
  } catch (err: any) {
    if (err instanceof ProviderRateLimitError) {
      return c.json({ error: { code: 'provider_rate_limited', message: err.message, retry_after_sec: err.retryAfterSec } }, 429);
    }
    return c.json({ error: { code: 'transcription_failed', message: err.message } }, 502);
  }

  if (!sttRes.text || sttRes.text.trim().length === 0 || (sttRes.noSpeechProb && sttRes.noSpeechProb > 0.85)) {
    return c.json({ error: { code: 'no_speech_detected', message: 'No speech recognized' } }, 422);
  }

  // Resolve source language if auto
  if (sourceLang === 'auto') {
    sourceLang = normalizeLocale(sttRes.detectedLanguage) || sttRes.detectedLanguage || 'en-US';
  }

  // Validate language pair
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

  // Translation
  let transRes;
  try {
    transRes = await providerManager.translate(sttRes.text, sourceLang, targetLang);
  } catch (err: any) {
    if (err instanceof ProviderRateLimitError) {
      return c.json({ error: { code: 'provider_rate_limited', message: err.message, retry_after_sec: err.retryAfterSec } }, 429);
    }
    return c.json({ error: { code: 'translation_failed', message: err.message } }, 502);
  }

  // TTS
  const voice = resolveTtsVoice(targetLang);
  let ttsRes;
  try {
    ttsRes = await providerManager.synthesize(transRes.text, voice.voiceId, voice.provider);
  } catch (err: any) {
    if (err instanceof ProviderRateLimitError) {
      return c.json({ error: { code: 'provider_rate_limited', message: err.message, retry_after_sec: err.retryAfterSec } }, 429);
    }
    return c.json({ error: { code: 'synthesis_failed', message: err.message } }, 502);
  }

  const jobId = `job_${crypto.randomBytes(12).toString('hex')}`;
  const totalMs = Date.now() - startTime;
  const settings = await redis.getSettings();

  // Produce output format: WAV or PCM
  let outputAudioBytes = ttsRes.audio;
  let outputFormat = 'pcm';
  if (queryFormat === 'wav') {
    outputAudioBytes = pcmToWav(ttsRes.audio, 16000, 1, 16);
    outputFormat = 'wav';
  }

  // Background persistence
  safeWaitUntil(
    (async () => {
      let inputBlobPath: string | undefined;
      let outputBlobPath: string | undefined;

      if (settings.store_audio) {
        try {
          inputBlobPath = await blob.uploadAudio(wavAudioForStt, 'original', jobId);
          outputBlobPath = await blob.uploadAudio(outputAudioBytes, 'translated', jobId);
        } catch (bErr) {
          console.warn('[Blob] Utterance audio upload failed:', bErr);
        }
      }

      let convId = undefined;
      if (deviceId) {
        convId = await postgres.touchConversation(deviceId, 120);
      }

      await postgres.createJob({
        jobId,
        kind,
        deviceId: deviceId || undefined,
        conversationId: convId,
        status: 'completed',
        sourceLanguage: sourceLang,
        detectedLanguage: sttRes.detectedLanguage,
        targetLanguage: targetLang,
        transcript: sttRes.text,
        translation: transRes.text,
        audioInputBlobPath: inputBlobPath,
        audioOutputBlobPath: outputBlobPath,
        canRetry: Boolean(settings.store_audio && inputBlobPath),
        durationSec: durationSec || Math.round((ttsRes.durationMs / 1000) * 10) / 10,
        sttMs: sttRes.latencyMs,
        translateMs: transRes.latencyMs,
        synthesizeMs: ttsRes.latencyMs,
        totalMs,
      });
    })()
  );

  return c.json({
    job_id: jobId,
    id: jobId,
    conversation_id: deviceId ? `conv_${deviceId}` : undefined,
    status: 'completed',
    source_language: sourceLang,
    detected_language: sttRes.detectedLanguage,
    target_language: targetLang,
    transcript: sttRes.text,
    translation: transRes.text,
    can_retry: settings.store_audio,
    audio: {
      format: outputFormat,
      sample_rate: 16000,
      duration_ms: ttsRes.durationMs,
      base64: outputAudioBytes.toString('base64'),
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
