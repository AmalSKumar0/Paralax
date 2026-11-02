/**
 * Pure TypeScript / Node audio utilities for PCM, WAV containers, RMS silence check, and resampling.
 * No external ffmpeg binary required.
 */

export interface AudioValidationResult {
  pcm: Buffer;
  format: 'pcm' | 'wav' | 'mp3' | 'other';
  sampleRate: number;
  channels: number;
  durationSec: number;
  isSilent: boolean;
}

/**
 * Creates a standard 44-byte RIFF WAV header for 16-bit mono PCM.
 */
export function createWavHeader(
  dataLength: number,
  sampleRate: number = 16000,
  channels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write('RIFF', 0); // ChunkID
  header.writeUInt32LE(36 + dataLength, 4); // ChunkSize
  header.write('WAVE', 8); // Format
  header.write('fmt ', 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = Linear PCM)
  header.writeUInt16LE(channels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  header.write('data', 36); // Subchunk2ID
  header.writeUInt32LE(dataLength, 40); // Subchunk2Size

  return header;
}

/**
 * Wraps raw PCM buffer into a playable WAV container.
 */
export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate: number = 16000,
  channels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const header = createWavHeader(pcmBuffer.length, sampleRate, channels, bitsPerSample);
  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Calculates Root Mean Square (RMS) amplitude of 16-bit signed PCM audio.
 */
export function calculatePcmRms(pcmBuffer: Buffer): number {
  if (pcmBuffer.length < 2) return 0;
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  let sumSquares = 0;

  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / sampleCount);
}

/**
 * Parses and validates audio bytes: detects WAV, raw PCM, or other format.
 * Returns decoded 16 kHz 16-bit mono PCM bytes, duration, and silence status.
 */
export function validateAndParseAudio(
  rawBuffer: Buffer,
  contentType: string = 'audio/L16;rate=16000',
  maxDurationSec: number = 20
): AudioValidationResult {
  if (!rawBuffer || rawBuffer.length === 0) {
    throw new AudioValidationError('invalid_audio_format', 'Audio buffer is empty');
  }

  // Check if buffer starts with RIFF header
  const isWav = rawBuffer.length >= 44 && rawBuffer.toString('ascii', 0, 4) === 'RIFF' && rawBuffer.toString('ascii', 8, 12) === 'WAVE';

  let pcmData: Buffer;
  let sampleRate = 16000;
  let channels = 1;

  if (isWav) {
    // Parse fmt chunk
    let offset = 12;
    let dataOffset = -1;
    let dataLength = 0;

    while (offset < rawBuffer.length - 8) {
      const chunkId = rawBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = rawBuffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ') {
        channels = rawBuffer.readUInt16LE(offset + 10);
        sampleRate = rawBuffer.readUInt32LE(offset + 12);
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataLength = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
    }

    if (dataOffset === -1) {
      throw new AudioValidationError('invalid_audio_format', 'Invalid WAV file: data chunk not found');
    }

    pcmData = rawBuffer.subarray(dataOffset, dataOffset + dataLength);
  } else {
    // Treat as raw PCM (L16, 16-bit signed, mono, 16000Hz)
    pcmData = rawBuffer;
    if (contentType.includes('rate=')) {
      const match = contentType.match(/rate=(\d+)/);
      if (match) {
        sampleRate = parseInt(match[1], 10);
      }
    }
  }

  // 16-bit mono = 2 bytes per sample
  const bytesPerSample = 2 * channels;
  const sampleCount = pcmData.length / bytesPerSample;
  const durationSec = sampleCount / sampleRate;

  if (durationSec > maxDurationSec) {
    throw new AudioValidationError('audio_too_long', `Audio duration of ${durationSec.toFixed(1)}s exceeds maximum allowed (${maxDurationSec}s)`);
  }

  // Calculate RMS for silence detection
  const rms = calculatePcmRms(pcmData);
  const isSilent = rms < 120; // Silence threshold for 16-bit audio (full scale is 32767)

  return {
    pcm: pcmData,
    format: isWav ? 'wav' : 'pcm',
    sampleRate,
    channels,
    durationSec: Math.round(durationSec * 100) / 100,
    isSilent,
  };
}

/**
 * Resamples Float32 mono samples from inRate to outRate using linear interpolation
 * and returns a 16-bit signed little-endian PCM buffer.
 */
export function resampleFloatToPcm16(
  samples: Float32Array,
  inRate: number,
  outRate: number = 16000
): Buffer {
  if (inRate === outRate) {
    const buf = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      const s16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
      buf.writeInt16LE(Math.round(s16), i * 2);
    }
    return buf;
  }

  const outLength = Math.round((samples.length * outRate) / inRate);
  const pcm16 = Buffer.alloc(outLength * 2);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = (i * inRate) / outRate;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = srcIndex - i0;
    const sample = samples[i0] * (1 - frac) + samples[i1] * frac;

    const clamped = Math.max(-1, Math.min(1, sample));
    const s16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
    pcm16.writeInt16LE(Math.round(s16), i * 2);
  }

  return pcm16;
}

/**
 * Truncates string to maxChars and encodes as base64url for HTTP headers.
 */
export function encodeBase64Url(str: string, maxChars: number = 300): string {
  if (!str) return '';
  const truncated = str.slice(0, maxChars);
  return Buffer.from(truncated, 'utf-8').toString('base64url');
}

export class AudioValidationError extends Error {
  public code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AudioValidationError';
    this.code = code;
  }
}
