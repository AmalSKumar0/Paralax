import { STTProvider, STTOptions, STTResult, ProviderRateLimitError, ProviderError } from '../types.js';

export class GroqSTTProvider implements STTProvider {
  public readonly name = 'groq';
  public readonly isPaid = false;

  public isAvailable(): boolean {
    return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0);
  }

  public async transcribe(audioWav: Buffer, options?: STTOptions): Promise<STTResult> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      throw new ProviderError(this.name, 'GROQ_API_KEY is not configured');
    }

    const model = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';
    const baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

    // Construct FormData natively in Node 18+
    const formData = new FormData();
    const audioBlob = new Blob([audioWav], { type: 'audio/wav' });
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', model);
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0');

    if (options?.language && options.language !== 'auto') {
      const langShort = options.language.split('-')[0].toLowerCase();
      formData.append('language', langShort);
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
      throw new ProviderRateLimitError(this.name, 'Groq Whisper rate limit exceeded', isNaN(retrySec) ? 60 : retrySec);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new ProviderError(this.name, `HTTP ${res.status}: ${errText}`, res.status);
    }

    const data = await res.json() as {
      text?: string;
      language?: string;
      segments?: Array<{ no_speech_prob?: number; avg_logprob?: number }>;
    };

    const transcript = (data.text || '').trim();
    const firstSegment = data.segments?.[0];

    return {
      transcript,
      detectedLanguage: data.language,
      confidence: firstSegment?.avg_logprob ? Math.min(1.0, Math.exp(firstSegment.avg_logprob)) : 0.95,
      noSpeechProb: firstSegment?.no_speech_prob ?? 0.0,
      avgLogprob: firstSegment?.avg_logprob ?? 0.0,
    };
  }
}
