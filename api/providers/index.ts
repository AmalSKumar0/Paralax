import {
  STTProvider,
  TranslatorProvider,
  TTSProvider,
  STTOptions,
  STTResult,
  STTExecutionResult,
  TranslateExecutionResult,
  TTSExecutionResult,
  ProviderRateLimitError,
  ProviderError,
} from './types.js';
import { GroqSTTProvider } from './stt/groq.js';
import { XAISTTProvider } from './stt/xai.js';
import { GroqTranslatorProvider } from './translator/groq.js';
import { XAITranslatorProvider } from './translator/xai.js';
import { EdgeTTSProvider } from './tts/edge.js';
import { XAITTSProvider } from './tts/xai.js';

export interface ProviderCallStats {
  calls: number;
  lastSuccess?: string;
  lastError?: string;
}

class ProviderManager {
  private sttRegistry: Map<string, STTProvider> = new Map();
  private translatorRegistry: Map<string, TranslatorProvider> = new Map();
  private ttsRegistry: Map<string, TTSProvider> = new Map();

  private stats: Map<string, ProviderCallStats> = new Map();

  constructor() {
    this.registerSTT(new GroqSTTProvider());
    this.registerSTT(new XAISTTProvider());

    this.registerTranslator(new GroqTranslatorProvider());
    this.registerTranslator(new XAITranslatorProvider());

    this.registerTTS(new EdgeTTSProvider());
    this.registerTTS(new XAITTSProvider());
  }

  public registerSTT(provider: STTProvider) {
    this.sttRegistry.set(provider.name, provider);
  }

  public registerTranslator(provider: TranslatorProvider) {
    this.translatorRegistry.set(provider.name, provider);
  }

  public registerTTS(provider: TTSProvider) {
    this.ttsRegistry.set(provider.name, provider);
  }

  private recordSuccess(name: string) {
    const s = this.stats.get(name) || { calls: 0 };
    s.calls += 1;
    s.lastSuccess = new Date().toISOString();
    this.stats.set(name, s);
  }

  private recordError(name: string, errMessage: string) {
    const s = this.stats.get(name) || { calls: 0 };
    s.calls += 1;
    s.lastError = errMessage;
    this.stats.set(name, s);
  }

  public getStats(name?: string): Record<string, ProviderCallStats> | ProviderCallStats {
    if (name) {
      return this.stats.get(name) || { calls: 0 };
    }
    const result: Record<string, ProviderCallStats> = {};
    for (const [k, v] of this.stats.entries()) {
      result[k] = v;
    }
    return result;
  }

  public getActiveChains() {
    const sttChain = (process.env.STT_PROVIDERS || 'groq,xai')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const translateChain = (process.env.TRANSLATE_PROVIDERS || 'groq,xai')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const ttsChain = (process.env.TTS_PROVIDERS || 'edge,xai')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    return {
      stt: sttChain,
      translate: translateChain,
      tts: ttsChain,
      allow_paid_fallback: process.env.ALLOW_PAID_FALLBACK === 'true',
    };
  }

  public async speechToText(audioWav: Buffer, options?: STTOptions | string): Promise<STTExecutionResult> {
    const opt: STTOptions | undefined = typeof options === 'string' ? { language: options } : options;
    const chain = this.getActiveChains().stt;
    let maxRetryAfterSec = 60;
    let allRateLimited = true;
    const errors: Error[] = [];

    for (const name of chain) {
      const p = this.sttRegistry.get(name);
      if (!p || !p.isAvailable()) continue;

      const start = Date.now();
      try {
        const res = await p.speechToText(audioWav, opt);
        const latencyMs = Date.now() - start;
        this.recordSuccess(name);
        return {
          text: res.transcript,
          detectedLanguage: res.detectedLanguage,
          confidence: res.confidence,
          noSpeechProb: res.noSpeechProb,
          avgLogprob: res.avgLogprob,
          provider: name,
          latencyMs,
        };
      } catch (err: any) {
        this.recordError(name, err.message);
        errors.push(err);

        if (err instanceof ProviderRateLimitError) {
          maxRetryAfterSec = Math.max(maxRetryAfterSec, err.retryAfterSec);
        } else {
          allRateLimited = false;
        }
      }
    }

    if (errors.length > 0 && allRateLimited) {
      throw new ProviderRateLimitError('all', 'All configured STT providers returned rate limits', maxRetryAfterSec);
    }

    throw new ProviderError('stt', `All STT providers failed: ${errors.map((e) => e.message).join('; ')}`);
  }

  public async translate(text: string, sourceLang: string, targetLang: string): Promise<TranslateExecutionResult> {
    const chain = this.getActiveChains().translate;
    let maxRetryAfterSec = 60;
    let allRateLimited = true;
    const errors: Error[] = [];

    for (const name of chain) {
      const p = this.translatorRegistry.get(name);
      if (!p || !p.isAvailable()) continue;

      const start = Date.now();
      try {
        const res = await p.translate(text, sourceLang, targetLang);
        const latencyMs = Date.now() - start;
        this.recordSuccess(name);
        return {
          text: res,
          provider: name,
          latencyMs,
        };
      } catch (err: any) {
        this.recordError(name, err.message);
        errors.push(err);

        if (err instanceof ProviderRateLimitError) {
          maxRetryAfterSec = Math.max(maxRetryAfterSec, err.retryAfterSec);
        } else {
          allRateLimited = false;
        }
      }
    }

    if (errors.length > 0 && allRateLimited) {
      throw new ProviderRateLimitError('all', 'All configured translation providers returned rate limits', maxRetryAfterSec);
    }

    throw new ProviderError('translator', `All translation providers failed: ${errors.map((e) => e.message).join('; ')}`);
  }

  public async synthesize(text: string, voiceId?: string, preferredProvider?: string): Promise<TTSExecutionResult> {
    const chain = this.getActiveChains().tts;
    let maxRetryAfterSec = 60;
    let allRateLimited = true;
    const errors: Error[] = [];

    // Prioritize preferredProvider if specified and it is part of configured chain
    const orderedChain = preferredProvider && chain.includes(preferredProvider)
      ? [preferredProvider, ...chain.filter((c) => c !== preferredProvider)]
      : chain;

    for (const name of orderedChain) {
      const p = this.ttsRegistry.get(name);
      if (!p || !p.isAvailable()) continue;

      const start = Date.now();
      try {
        const audioPcm = await p.synthesize(text, 'auto', voiceId);
        const latencyMs = Date.now() - start;
        this.recordSuccess(name);
        // 16000Hz * 1 channel * 2 bytes = 32000 bytes per sec
        const durationMs = Math.round((audioPcm.length / 32000) * 1000);
        return {
          audio: audioPcm,
          durationMs,
          provider: name,
          latencyMs,
        };
      } catch (err: any) {
        this.recordError(name, err.message);
        errors.push(err);

        if (err instanceof ProviderRateLimitError) {
          maxRetryAfterSec = Math.max(maxRetryAfterSec, err.retryAfterSec);
        } else {
          allRateLimited = false;
        }
      }
    }

    if (errors.length > 0 && allRateLimited) {
      throw new ProviderRateLimitError('all', 'All configured TTS providers returned rate limits', maxRetryAfterSec);
    }

    throw new ProviderError('tts', `All TTS providers failed: ${errors.map((e) => e.message).join('; ')}`);
  }
}

export const providerManager = new ProviderManager();
export * from './types.js';
