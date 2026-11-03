import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdaptorServer } from '@hono/node-server';
import { WebSocket } from 'ws';
import { app } from '../server/app.js';
import { setupWebSocketServer } from '../server/websocket/streamHandler.js';
import { redis, hashSecret } from '../server/db/redis.js';
import { providerManager } from '../server/providers/index.js';

function createTestTonePcm(durationSec = 1.0, freqHz = 440, sampleRate = 16000): Buffer {
  const samples = Math.floor(durationSec * sampleRate);
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freqHz * t) * 0.5 * 32767;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), i * 2);
  }
  return buf;
}

describe('Paralax WebSocket Audio Streaming Pipeline', () => {
  let server: any;
  let wss: any;
  let testPort: number;
  const testDeviceKey = 'key_ws_test_device_secret_1234567890abcdef';
  const testDeviceId = 'dev_ws_test_01';

  beforeAll(async () => {
    // Register test device in Redis
    await redis.saveDevice({
      id: testDeviceId,
      device_id: testDeviceId,
      name: 'WebSocket Test Device',
      key_hash: hashSecret(testDeviceKey),
      status: 'active',
      created_at: new Date().toISOString(),
      config_version: 1,
      applied_config_version: 1,
      config: {
        language_a: 'en-US',
        language_b: 'es-US',
        mode: 'buttons',
        config_version: 1,
      },
    });

    // Mock speech-to-text, translate, and synthesize in providerManager for fast test execution
    providerManager.speechToText = async () => ({
      provider: 'mock',
      text: 'Good morning',
      detectedLanguage: 'en-US',
      latencyMs: 120,
    });
    providerManager.translate = async () => ({
      provider: 'mock',
      text: 'Buenos días',
      latencyMs: 150,
      cached: false,
    });
    providerManager.synthesize = async () => ({
      provider: 'mock',
      audio: createTestTonePcm(0.8, 880, 16000),
      durationMs: 800,
      format: 'pcm',
      sampleRate: 16000,
      latencyMs: 110,
    });

    server = createAdaptorServer({ fetch: app.fetch });
    wss = setupWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        testPort = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (wss) {
      wss.clients.forEach((c: any) => c.terminate());
      await new Promise<void>((r) => wss.close(() => r()));
    }
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. Rejects unauthorized connections with code 4001', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws/device/stream`);

    const result = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test 1 timeout after 3s')), 3000);
      ws.on('open', () => {
        console.log('[Test 1] ws connected, sending invalid auth');
        ws.send(JSON.stringify({ type: 'auth', key: 'invalid_bad_key' }));
      });
      ws.on('message', (d) => {
        console.log('[Test 1] received message:', d.toString());
      });
      ws.on('close', (code, reason) => {
        console.log('[Test 1] ws closed:', code, reason.toString());
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
      ws.on('error', (err) => {
        console.error('[Test 1] ws error:', err);
      });
    });

    expect(result.code).toBe(4001);
  });

  it('2. Authenticates via URL query param and returns ready message', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws/device/stream?key=${testDeviceKey}`);

    const readyMsg = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test 2 timeout after 3s')), 3000);
      ws.on('message', (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
      ws.on('error', (err) => {
        console.error('[Test 2] ws error:', err);
      });
    });

    expect(readyMsg.type).toBe('ready');
    expect(readyMsg.device_id).toBe(testDeviceId);
    ws.close();
  });

  it('3. Full bidirectional streaming: Mic binary audio up -> Transcript -> Translation -> Speaker binary audio down', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws/device/stream?key=${testDeviceKey}`);

    const textMessages: any[] = [];
    const speakerAudioChunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for test 3 completion')), 6000);

      ws.on('open', () => {
        console.log('[Test 3] ws open');
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          speakerAudioChunks.push(Buffer.from(data as any));
          return;
        }

        const msg = JSON.parse(data.toString());
        console.log('[Test 3] received message type:', msg.type);
        textMessages.push(msg);

        if (msg.type === 'ready') {
          // Send start recording
          ws.send(JSON.stringify({ type: 'start', direction: 'a_to_b' }));
        } else if (msg.type === 'recording_started') {
          // Stream 1.0 second of audio chunks
          const testMicAudio = createTestTonePcm(1.0, 500, 16000);
          const CHUNK_SIZE = 1024;
          for (let offset = 0; offset < testMicAudio.length; offset += CHUNK_SIZE) {
            const chunk = testMicAudio.subarray(offset, offset + CHUNK_SIZE);
            ws.send(chunk, { binary: true });
          }
          // Then send stop
          ws.send(JSON.stringify({ type: 'stop' }));
        } else if (msg.type === 'audio_stream_end') {
          clearTimeout(timeout);
          resolve();
        }
      });

      ws.on('error', (err) => {
        console.error('[Test 3] ws error:', err);
        clearTimeout(timeout);
        reject(err);
      });
    });

    ws.close();

    // Verify text sequence
    const types = textMessages.map((m) => m.type);
    expect(types).toContain('processing');
    expect(types).toContain('transcript');
    expect(types).toContain('translation');
    expect(types).toContain('audio_stream_start');
    expect(types).toContain('audio_stream_end');

    const transcriptMsg = textMessages.find((m) => m.type === 'transcript');
    expect(transcriptMsg.text).toBe('Good morning');

    const translationMsg = textMessages.find((m) => m.type === 'translation');
    expect(translationMsg.text).toBe('Buenos días');

    // Verify binary speaker audio was streamed down
    expect(speakerAudioChunks.length).toBeGreaterThan(0);
    const totalSpeakerBytes = speakerAudioChunks.reduce((acc, c) => acc + c.length, 0);
    expect(totalSpeakerBytes).toBeGreaterThan(1000);
  });
});
