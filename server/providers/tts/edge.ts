import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { MPEGDecoder } from 'mpg123-decoder';
import { TTSProvider, ProviderError } from '../types.js';
import { resampleFloatToPcm16 } from '../../shared/audio.js';
import { resolveTtsVoice } from '../../shared/languages.js';

export class EdgeTTSProvider implements TTSProvider {
  public readonly name = 'edge';
  public readonly isPaid = false;

  public isAvailable(): boolean {
    return true; // Microsoft Edge TTS is 100% free with no key required
  }

  public supportsLanguage(_targetLang: string): boolean {
    return true;
  }

  public async synthesize(text: string, targetLang: string, voiceId?: string): Promise<Buffer> {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      return Buffer.alloc(3200, 0); // 0.1s silence PCM
    }

    const resolved = resolveTtsVoice(targetLang, voiceId, ['edge']);
    const chosenVoice = voiceId || resolved.voiceId;

    const tts = new MsEdgeTTS({ enableLogger: false, connectionTimeoutMs: 15000 });
    await tts.setMetadata(chosenVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(cleanText);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      audioStream.on('close', () => {
        resolve();
      });
      audioStream.on('error', (err) => {
        reject(new ProviderError(this.name, `Edge TTS streaming error: ${err.message}`));
      });
    });

    const mp3Buffer = Buffer.concat(chunks);
    if (mp3Buffer.length === 0) {
      throw new ProviderError(this.name, 'Edge TTS returned empty audio stream');
    }

    // Decode MP3 into Float32Array PCM samples using pure WASM (mpg123-decoder)
    const decoder = new MPEGDecoder();
    try {
      await decoder.ready;
      const decoded = decoder.decode(mp3Buffer);

      if (!decoded.channelData || decoded.channelData.length === 0) {
        throw new ProviderError(this.name, 'Failed to decode synthesized MP3 audio');
      }

      // Convert from source sample rate (typically 24kHz) to standard ESP32 16kHz 16-bit mono PCM
      const monoFloatSamples = decoded.channelData[0];
      const pcm16 = resampleFloatToPcm16(monoFloatSamples, decoded.sampleRate, 16000);

      return pcm16;
    } finally {
      decoder.free();
    }
  }
}
