import { STTProvider, STTOptions, STTResult, ProviderRateLimitError, ProviderError } from '../types.js';

export class XAISTTProvider implements STTProvider {
  public readonly name = 'xai';
  public readonly isPaid = true;

  public isAvailable(): boolean {
    const paidAllowed = process.env.ALLOW_PAID_FALLBACK === 'true';
    const hasKey = Boolean(process.env.XAI_API_KEY && process.env.XAI_API_KEY.trim().length > 0);
    return paidAllowed && hasKey;
  }

  public async speechToText(audioWav: Buffer, options?: STTOptions): Promise<STTResult> {
    if (!this.isAvailable()) {
      throw new ProviderError(this.name, 'xAI paid provider is not enabled or missing XAI_API_KEY');
    }

    const apiKey = process.env.XAI_API_KEY!.trim();
    const baseUrl = process.env.XAI_BASE_URL || 'https://api.x.ai/v1';

    const formData = new FormData();
    const audioBlob = new Blob([audioWav], { type: 'audio/wav' });
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'grok-voice-latest');

    if (options?.language && options.language !== 'auto') {
      formData.append('language', options.language.split('-')[0].toLowerCase());
    }

    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (res.status === 429) {
      const retryHeader = res.headers.get('retry-after');
      const retrySec = retryHeader ? parseInt(retryHeader, 10) : 60;
      throw new ProviderRateLimitError(this.name, 'xAI rate limit exceeded', isNaN(retrySec) ? 60 : retrySec);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new ProviderError(this.name, `HTTP ${res.status}: ${errText}`, res.status);
    }

    const data = await res.json() as { text?: string; language?: string };
    return {
      transcript: (data.text || '').trim(),
      detectedLanguage: data.language,
      confidence: 0.95,
      noSpeechProb: 0.0,
      avgLogprob: 0.0,
    };
  }
}
