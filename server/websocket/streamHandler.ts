import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { redis, DeviceRecord } from '../db/redis.js';
import { providerManager } from '../providers/index.js';
import { calculatePcmRms, pcmToWav } from '../shared/audio.js';
import { resolveTtsVoice, normalizeLocale } from '../shared/languages.js';

interface StreamSession {
  ws: WebSocket;
  device?: DeviceRecord;
  authenticated: boolean;
  isRecording: boolean;
  direction: 'a_to_b' | 'b_to_a';
  sourceLang: string;
  targetLang: string;
  sampleRate: number;
  audioChunks: Buffer[];
  totalBytes: number;
  startTime: number;
}

export function setupWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/device/stream' || url.pathname === '/ws/translate') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const queryKey = url.searchParams.get('key') || url.searchParams.get('device_key');
    const headerKey = req.headers['x-device-key'] as string | undefined;
    const initialKey = queryKey || headerKey;

    const session: StreamSession = {
      ws,
      authenticated: false,
      isRecording: false,
      direction: 'a_to_b',
      sourceLang: 'en-US',
      targetLang: 'es-US',
      sampleRate: 16000,
      audioChunks: [],
      totalBytes: 0,
      startTime: Date.now(),
    };

    if (initialKey) {
      const device = await redis.findDeviceByKey(initialKey);
      if (device && device.status === 'active') {
        session.device = device;
        session.authenticated = true;
        session.sourceLang = device.config.language_a;
        session.targetLang = device.config.language_b;
        console.log(`[WebSocket] Client authenticated: "${device.name}" (${device.id}) [${session.sourceLang} <-> ${session.targetLang}]`);
        ws.send(JSON.stringify({
          type: 'ready',
          device_id: device.id,
          name: device.name,
          config: device.config,
        }));
      } else {
        console.warn(`[WebSocket] Authentication failed: key "${initialKey.slice(0, 12)}..." not recognized!`);
        ws.send(JSON.stringify({
          type: 'error',
          code: 'unauthorized',
          message: 'Invalid or unrecognized device key',
        }));
      }
    } else {
      console.log('[WebSocket] Client connected without key in URL. Awaiting "auth" control message...');
    }

    ws.on('message', async (data: any, isBinary: boolean) => {
      // 1. Binary frames: Raw PCM chunks from microphone
      if (isBinary) {
        if (!session.authenticated) {
          ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Not authenticated' }));
          return;
        }
        if (!session.isRecording) {
          return; // Ignore audio packets if recording not active
        }
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        session.audioChunks.push(buf);
        session.totalBytes += buf.length;
        return;
      }

      // 2. Text / JSON control frames
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'invalid_json', message: 'Payload must be valid JSON' }));
        return;
      }

      switch (msg.type) {
        case 'auth': {
          const key = msg.key || msg.device_key;
          if (!key) {
            ws.send(JSON.stringify({ type: 'error', code: 'missing_key', message: 'Device key required' }));
            return;
          }
          const device = await redis.findDeviceByKey(key);
          if (!device || device.status !== 'active') {
            ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Invalid or revoked device key' }));
            ws.close(4001, 'Unauthorized');
            return;
          }
          session.device = device;
          session.authenticated = true;
          session.sourceLang = device.config.language_a;
          session.targetLang = device.config.language_b;
          ws.send(JSON.stringify({
            type: 'ready',
            device_id: device.id,
            name: device.name,
            config: device.config,
          }));
          break;
        }

        case 'start': {
          if (!session.authenticated) {
            ws.send(JSON.stringify({ type: 'error', code: 'unauthorized', message: 'Must authenticate first' }));
            return;
          }
          session.direction = msg.direction === 'b_to_a' ? 'b_to_a' : 'a_to_b';
          if (session.device) {
            session.sourceLang = session.direction === 'a_to_b' ? session.device.config.language_a : session.device.config.language_b;
            session.targetLang = session.direction === 'a_to_b' ? session.device.config.language_b : session.device.config.language_a;
          } else {
            session.sourceLang = msg.source || session.sourceLang;
            session.targetLang = msg.target || session.targetLang;
          }
          session.sampleRate = msg.sample_rate || 16000;
          session.audioChunks = [];
          session.totalBytes = 0;
          session.isRecording = true;
          session.startTime = Date.now();

          ws.send(JSON.stringify({
            type: 'recording_started',
            direction: session.direction,
            source_language: session.sourceLang,
            target_language: session.targetLang,
            sample_rate: session.sampleRate,
          }));
          break;
        }

        case 'stop': {
          if (!session.isRecording) {
            ws.send(JSON.stringify({ type: 'error', code: 'not_recording', message: 'No active recording session' }));
            return;
          }
          session.isRecording = false;
          const captureDurationMs = Date.now() - session.startTime;

          const pcmBuffer = Buffer.concat(session.audioChunks);
          session.audioChunks = [];

          if (pcmBuffer.length < 3200) { // < 0.1s
            ws.send(JSON.stringify({
              type: 'error',
              code: 'audio_too_short',
              message: 'Recording too short (minimum 0.1s required)',
            }));
            return;
          }

          // Check RMS silence
          const rms = calculatePcmRms(pcmBuffer);
          if (rms < 120) {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'no_speech_detected',
              message: 'Audio signal contains no speech (silence)',
              rms: Math.round(rms),
            }));
            return;
          }

          ws.send(JSON.stringify({
            type: 'processing',
            bytes_received: pcmBuffer.length,
            duration_ms: captureDurationMs,
            rms: Math.round(rms),
          }));

          try {
            const processStart = Date.now();
            const wavAudio = pcmToWav(pcmBuffer, session.sampleRate, 1, 16);

            // 1. Speech-to-Text
            const sttStart = Date.now();
            const sttRes = await providerManager.speechToText(
              wavAudio,
              session.sourceLang !== 'auto' ? normalizeLocale(session.sourceLang) || undefined : undefined
            );
            const sttMs = Date.now() - sttStart;

            if (!sttRes.text || sttRes.text.trim().length === 0) {
              ws.send(JSON.stringify({
                type: 'error',
                code: 'no_speech_detected',
                message: 'Speech recognition detected no intelligible words',
              }));
              return;
            }

            ws.send(JSON.stringify({
              type: 'transcript',
              text: sttRes.text,
              source_language: session.sourceLang,
              detected_language: sttRes.detectedLanguage,
              stt_ms: sttMs,
            }));

            // 2. Translation
            const transStart = Date.now();
            const transRes = await providerManager.translate(sttRes.text, session.sourceLang, session.targetLang);
            const transMs = Date.now() - transStart;

            ws.send(JSON.stringify({
              type: 'translation',
              text: transRes.text,
              target_language: session.targetLang,
              translate_ms: transMs,
            }));

            // 3. Speech Synthesis
            const ttsStart = Date.now();
            const voice = resolveTtsVoice(session.targetLang);
            const ttsRes = await providerManager.synthesize(transRes.text, voice.voiceId, voice.provider);
            const ttsMs = Date.now() - ttsStart;
            const totalMs = Date.now() - processStart;

            // Notify client audio stream is beginning
            ws.send(JSON.stringify({
              type: 'audio_stream_start',
              sample_rate: 16000,
              format: 'pcm16',
              byte_length: ttsRes.audio.length,
              stt_ms: sttMs,
              translate_ms: transMs,
              tts_ms: ttsMs,
              total_ms: totalMs,
            }));

            // Stream audio down in 1024-byte binary frames to the speaker
            const CHUNK_SIZE = 1024;
            for (let offset = 0; offset < ttsRes.audio.length; offset += CHUNK_SIZE) {
              const chunk = ttsRes.audio.subarray(offset, offset + CHUNK_SIZE);
              ws.send(chunk, { binary: true });
            }

            // Signal audio stream complete
            ws.send(JSON.stringify({
              type: 'audio_stream_end',
              job_id: `job_${crypto.randomBytes(8).toString('hex')}`,
              total_ms: totalMs,
            }));

          } catch (err: any) {
            console.error('[WebSocket Error]', err);
            ws.send(JSON.stringify({
              type: 'error',
              code: 'pipeline_failed',
              message: err.message || 'Pipeline processing failed',
            }));
          }
          break;
        }

        case 'heartbeat': {
          if (session.device) {
            await redis.updateDeviceState(session.device.id, {
              rssi: msg.rssi,
              battery_pct: msg.battery_pct,
              uptime_sec: msg.uptime_sec,
            });
            ws.send(JSON.stringify({
              type: 'heartbeat_ack',
              config_version: session.device.config_version,
              timestamp: new Date().toISOString(),
            }));
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', code: 'unknown_type', message: `Unknown message type: ${msg.type}` }));
      }
    });

    ws.on('error', (err) => {
      console.warn('[WebSocket Client Error]', err);
    });
  });

  return wss;
}
