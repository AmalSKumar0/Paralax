/**
 * Encodes audio PCM data into a 16 kHz, 16-bit Mono PCM WAV Blob.
 */

export function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  // If sample rate is not 16000, resample to 16000
  const targetSampleRate = 16000;
  const resampled = sampleRate === targetSampleRate 
    ? samples 
    : downsampleBuffer(samples, sampleRate, targetSampleRate);

  const buffer = new ArrayBuffer(44 + resampled.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + resampled.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true); // 1 = PCM
  /* channel count (mono) */
  view.setUint16(22, 1, true); // 1 channel
  /* sample rate */
  view.setUint32(24, targetSampleRate, true);
  /* byte rate (SampleRate * NumChannels * BitsPerSample/8) */
  view.setUint32(28, targetSampleRate * 1 * 2, true);
  /* block align (NumChannels * BitsPerSample/8) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, resampled.length * 2, true);

  // Write 16-bit PCM samples
  floatTo16BitPCM(view, 44, resampled);

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

/**
 * Resamples an audio buffer to target sample rate via linear interpolation.
 */
export function downsampleBuffer(
  buffer: Float32Array,
  sourceRate: number,
  targetRate: number = 16000
): Float32Array {
  if (sourceRate === targetRate) {
    return buffer;
  }
  if (sourceRate < targetRate) {
    // If source is lower than target, interpolate upwards
    const ratio = sourceRate / targetRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;
      const nextIndex = Math.min(index + 1, buffer.length - 1);
      result[i] = buffer[index] * (1 - frac) + buffer[nextIndex] * frac;
    }
    return result;
  }

  // Downsampling
  const sampleRateRatio = sourceRate / targetRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}
