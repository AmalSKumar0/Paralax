#!/usr/bin/env node
/**
 * ESP32 IoT Voice Translator Device Simulator (Node.js ESM)
 *
 * Simulates physical ESP32 device lifecycle:
 * 1. Heartbeat (/api/v1/device/heartbeat) - sends telemetry & syncs config version
 * 2. Fetch Config (/api/v1/device/config) - retrieves language pair, mode, audio params
 * 3. Translate Utterance (/api/v1/device/translate) - posts PCM/WAV audio with Idempotency-Key,
 *    receives binary PCM with X-* headers, and saves as a playable WAV file.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Helper to generate a 16 kHz 16-bit mono sine wave PCM
function createSinePCM(durationSec = 2, freqHz = 440, sampleRate = 16000) {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buf = Buffer.alloc(totalSamples * 2);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freqHz * t) * 0.5 * 32767;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), i * 2);
  }
  return buf;
}

// Convert raw 16-bit mono PCM into standard WAV container
function pcmToWav(pcmBuffer, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataLength = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  pcmBuffer.copy(buffer, 44);
  return buffer;
}

function decodeBase64Url(str) {
  if (!str) return '';
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString('utf8');
}

// Parse CLI arguments
function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    apiUrl: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',
    deviceKey: process.env.DEVICE_KEY || '',
    audioFile: null,
    source: 'auto',
    target: null,
    outputWav: 'device_translated.wav',
    heartbeatOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--api-url' && args[i + 1]) options.apiUrl = args[++i];
    else if (arg === '--device-key' && args[i + 1]) options.deviceKey = args[++i];
    else if (arg === '--audio' && args[i + 1]) options.audioFile = args[++i];
    else if (arg === '--source' && args[i + 1]) options.source = args[++i];
    else if (arg === '--target' && args[i + 1]) options.target = args[++i];
    else if (arg === '--out' && args[i + 1]) options.outputWav = args[++i];
    else if (arg === '--heartbeat-only') options.heartbeatOnly = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Paralax ESP32 Device Simulator (Node.js)
Usage: node tools/device-sim.mjs [options]

Options:
  --api-url <url>      Base API URL (default: http://localhost:3000/api/v1)
  --device-key <key>   Device secret key (required for device endpoints)
  --audio <file>       Path to input audio file (WAV or raw PCM)
  --source <lang>      Source language code or 'auto' (default: auto)
  --target <lang>      Target language code (defaults to device config)
  --out <file>         Output WAV filepath (default: device_translated.wav)
  --heartbeat-only     Run only heartbeat & config check
  --help, -h           Show this help message
`);
      process.exit(0);
    }
  }

  // Normalize API URL to ensure /v1 endpoint
  options.apiUrl = options.apiUrl.replace(/\/+$/, '');
  if (!options.apiUrl.endsWith('/v1')) {
    if (options.apiUrl.endsWith('/api')) {
      options.apiUrl = `${options.apiUrl}/v1`;
    } else {
      options.apiUrl = `${options.apiUrl}/api/v1`;
    }
  }

  return options;
}

async function main() {
  const opts = parseCliArgs();

  console.log('='.repeat(60));
  console.log('  Paralax ESP32 Device Simulator');
  console.log(`  API Target: ${opts.apiUrl}`);
  console.log(`  Device Key: ${opts.deviceKey ? opts.deviceKey.slice(0, 10) + '...' : '(None provided)'}`);
  console.log('='.repeat(60));

  if (!opts.deviceKey) {
    console.warn('\n[!] Warning: No --device-key provided. Authenticated requests may return 401.');
    console.warn('    You can register a device or pass --device-key <key>.\n');
  }

  const commonHeaders = {
    'X-Device-Key': opts.deviceKey,
    'User-Agent': 'ESP32-Translator/1.0.0 (FreeRTOS; NodeSim)',
  };

  // 1. Send Heartbeat
  console.log('\n[1/3] Sending Device Heartbeat...');
  const heartbeatPayload = {
    firmware_version: '1.0.0',
    rssi: -62,
    free_heap: 142800,
    uptime_sec: 1800,
    battery_pct: 95,
    config_version: 1,
  };

  try {
    const hbRes = await fetch(`${opts.apiUrl}/device/heartbeat`, {
      method: 'POST',
      headers: { ...commonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(heartbeatPayload),
    });

    console.log(`      Status: ${hbRes.status} ${hbRes.statusText}`);
    const hbData = await hbRes.json();
    console.log('      Response:', JSON.stringify(hbData, null, 2));
  } catch (err) {
    console.error('      Heartbeat failed:', err.message);
  }

  // 2. Fetch Device Config
  console.log('\n[2/3] Fetching Device Configuration...');
  let deviceConfig = null;
  try {
    const cfgRes = await fetch(`${opts.apiUrl}/device/config`, {
      method: 'GET',
      headers: commonHeaders,
    });
    console.log(`      Status: ${cfgRes.status} ${cfgRes.statusText}`);
    if (cfgRes.ok) {
      deviceConfig = await cfgRes.json();
      console.log('      Config:', JSON.stringify(deviceConfig, null, 2));
    } else {
      console.warn('      Could not fetch config:', await cfgRes.text());
    }
  } catch (err) {
    console.error('      Config fetch error:', err.message);
  }

  if (opts.heartbeatOnly) {
    console.log('\nHeartbeat-only mode specified. Exiting successfully.');
    return;
  }

  // 3. Prepare Audio and Send Translation Request
  console.log('\n[3/3] Sending Audio Utterance for Translation...');
  let audioBytes;
  let contentType = 'audio/L16;rate=16000';

  if (opts.audioFile && fs.existsSync(opts.audioFile)) {
    console.log(`      Reading input audio: ${opts.audioFile}`);
    audioBytes = fs.readFileSync(opts.audioFile);
    if (opts.audioFile.endsWith('.wav')) {
      contentType = 'audio/wav';
    }
  } else {
    console.log('      Generating 2.0s 440Hz test PCM audio tone (16kHz mono)...');
    audioBytes = createSinePCM(2.0, 440, 16000);
  }

  const idempotencyKey = crypto.randomUUID();
  const targetLang = opts.target || deviceConfig?.language_b || 'es-ES';
  const queryParams = new URLSearchParams({
    source: opts.source || 'auto',
    target: targetLang,
    format: 'pcm',
  });

  const translateUrl = `${opts.apiUrl}/device/translate?${queryParams.toString()}`;
  console.log(`      POST ${translateUrl}`);
  console.log(`      Payload: ${audioBytes.length} bytes (${contentType})`);
  console.log(`      Idempotency-Key: ${idempotencyKey}`);

  const startTime = Date.now();
  try {
    const trRes = await fetch(translateUrl, {
      method: 'POST',
      headers: {
        ...commonHeaders,
        'Content-Type': contentType,
        'Accept': 'application/octet-stream',
        'Idempotency-Key': idempotencyKey,
      },
      body: audioBytes,
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`      Response: ${trRes.status} ${trRes.statusText} (${elapsedMs} ms)`);

    if (!trRes.ok) {
      const errText = await trRes.text();
      console.error('      Translation Error Response:', errText);
      process.exitCode = 1;
      return;
    }

    const respContentType = trRes.headers.get('content-type') || '';
    if (respContentType.includes('application/octet-stream') || respContentType.includes('audio/')) {
      const pcmArrayBuffer = await trRes.arrayBuffer();
      const pcmBuffer = Buffer.from(pcmArrayBuffer);

      const jobId = trRes.headers.get('x-job-id') || 'unknown';
      const detectedLang = trRes.headers.get('x-detected-language') || 'unknown';
      const outTargetLang = trRes.headers.get('x-target-language') || targetLang;
      const transcript = decodeBase64Url(trRes.headers.get('x-transcript'));
      const translation = decodeBase64Url(trRes.headers.get('x-translation'));
      const totalTimingsMs = trRes.headers.get('x-timings-total-ms') || elapsedMs;

      // Wrap raw 16kHz PCM into WAV container and write to disk
      const wavBuffer = pcmToWav(pcmBuffer, 16000, 1, 16);
      fs.writeFileSync(opts.outputWav, wavBuffer);

      console.log('\n' + '='.repeat(60));
      console.log('  TRANSLATION SUCCESSFUL (Single Round-Trip Binary)');
      console.log('='.repeat(60));
      console.log(`  Job ID:           ${jobId}`);
      console.log(`  Language Flow:    ${detectedLang} -> ${outTargetLang}`);
      console.log(`  Transcript:       "${transcript}"`);
      console.log(`  Translation:      "${translation}"`);
      console.log(`  Audio Received:   ${pcmBuffer.length} bytes PCM (~${(pcmBuffer.length / 32000).toFixed(2)}s audio)`);
      console.log(`  Saved Playable:   ${path.resolve(opts.outputWav)}`);
      console.log(`  Stage Timings:    Transcribe: ${trRes.headers.get('x-timings-transcribe-ms') || '-'}ms | Translate: ${trRes.headers.get('x-timings-translate-ms') || '-'}ms | Synthesize: ${trRes.headers.get('x-timings-synthesize-ms') || '-'}ms`);
      console.log(`  Total Processing: ${totalTimingsMs} ms (Network RTT: ${elapsedMs} ms)`);
      console.log('='.repeat(60) + '\n');
    } else {
      const jsonData = await trRes.json();
      console.log('      JSON Response:', JSON.stringify(jsonData, null, 2));
    }
  } catch (err) {
    console.error('      Translation request error:', err.message);
    process.exitCode = 1;
  }
}

main();
