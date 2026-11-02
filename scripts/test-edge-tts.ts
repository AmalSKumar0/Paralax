import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { MPEGDecoder } from 'mpg123-decoder';

async function testEdgeTtsWithDecoder() {
  console.log('Testing Edge TTS + mpg123-decoder WASM pipeline...');
  const tts = new MsEdgeTTS({ enableLogger: false });
  await tts.setMetadata('en-US-JennyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const t0 = Date.now();
  const { audioStream } = tts.toStream('Hello world, this is a full test of Edge TTS with pure WebAssembly MP3 to PCM decoding and linear resampling.');

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (d: Buffer) => chunks.push(d));
    audioStream.on('close', () => resolve());
    audioStream.on('error', (err) => reject(err));
  });

  const mp3Bytes = Buffer.concat(chunks);
  const ttsMs = Date.now() - t0;
  console.log(`[1] Edge TTS returned ${mp3Bytes.length} bytes MP3 in ${ttsMs}ms`);

  // Decode MP3 via pure WASM
  const tDecodeStart = Date.now();
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const decoded = decoder.decode(mp3Bytes);
  const decodeMs = Date.now() - tDecodeStart;

  console.log(`[2] WASM Decoded in ${decodeMs}ms:`, {
    sampleRate: decoded.sampleRate,
    channels: decoded.channelData.length,
    samplesDecoded: decoded.samplesDecoded,
  });

  // Resample from 24kHz to 16kHz
  const inSamples = decoded.channelData[0]; // Float32Array mono
  const inRate = decoded.sampleRate; // 24000
  const outRate = 16000;
  const outLength = Math.round((inSamples.length * outRate) / inRate);
  const pcm16 = Buffer.alloc(outLength * 2);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = (i * inRate) / outRate;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, inSamples.length - 1);
    const frac = srcIndex - i0;
    const sample = inSamples[i0] * (1 - frac) + inSamples[i1] * frac;

    // Clamp to 16-bit signed integer [-32768, 32767]
    const clamped = Math.max(-1, Math.min(1, sample));
    const s16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
    pcm16.writeInt16LE(Math.round(s16), i * 2);
  }

  console.log(`[3] Resampled to 16kHz: ${pcm16.length} bytes (${pcm16.length / 32000}s) PCM 16-bit mono`);
  decoder.free();
  console.log('[SUCCESS] Full pure-JS/WASM TTS pipeline completed without ffmpeg!');
}

testEdgeTtsWithDecoder().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
