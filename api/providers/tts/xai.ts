import { MPEGDecoder } from 'mpg123-decoder';
import { TTSProvider, ProviderRateLimitError, ProviderError } from '../types.js';
import { resampleFloatToPcm16 } from '../../shared/audio.js';

export class XAITTSProvider implements TTSProvider {
  public readonly name = 'xai';
  public readonly isPaid = true;

  public isAvailable(): boolean {
    const paidAllowed = process.env.ALLOW_PAID_FALLBACK === 'true';
    const hasKey = Boolean(process.env.XAI_API_KEY && process.env.XAI_API_KEY.trim().length > 0);
    return paidAllowed && hasKey;
  }

  public supportsLanguage(_targetLang: string): boolean {
    return true;
  }

  public async synthesize(text: string, _targetLang: string, voiceId?: string): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new ProviderError(this.name, 'xAI paid provider is not enabled or missing XAI_API_KEY');
    }

    const apiKey = process.env.XAI_API_KEY!.trim();
    const baseUrl = process.env.XAI_BASE_URL || 'https://api.x.ai/v1';

    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-voice-latest',
        input: text,
        voice: voiceId || 'alloy',
        response_format: 'mp3',
      }),
    });

    if (res.status === 429) {
      const retryHeader = res.headers.get('retry-after');
      const retrySec = retryHeader ? parseInt(retryHeader, 10) : 60;
      throw new ProviderRateLimitError(this.name, 'xAI Grok speech rate limit exceeded', isNaN(retrySec) ? 60 : retrySec);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new ProviderError(this.name, `HTTP ${res.status}: ${errText}`, res.status);
    }

    const mp3Buffer = Buffer.from(await res.arrayBuffer());

    const decoder = new MPEGDecoder();
    try {
      await decoder.ready;
      const decoded = decoder.decode(mp3Buffer);
      const monoFloatSamples = decoded.channelData[0];
      const pcm16 = resampleFloatToPcm16(monoFloatSamples, decoded.sampleRate, 16000);
      return pcm16;
    } finally {
      decoder.free();
    }
  }
}
