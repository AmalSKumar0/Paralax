export interface STTResult {
  transcript: string;
  detectedLanguage?: string;
  confidence?: number;
  noSpeechProb?: number;
  avgLogprob?: number;
}

export interface STTOptions {
  language?: string;
  sampleRate?: number;
}

export interface STTExecutionResult {
  text: string;
  detectedLanguage?: string;
  confidence?: number;
  noSpeechProb?: number;
  avgLogprob?: number;
  provider: string;
  latencyMs: number;
}

export interface TranslateExecutionResult {
  text: string;
  provider: string;
  latencyMs: number;
}

export interface TTSExecutionResult {
  audio: Buffer; // PCM 16-bit 16kHz mono
  durationMs: number;
  provider: string;
  latencyMs: number;
}

export interface STTProvider {
  readonly name: string;
  readonly isPaid: boolean;
  isAvailable(): boolean;
  transcribe(audioWav: Buffer, options?: STTOptions): Promise<STTResult>;
}

export interface TranslatorProvider {
  readonly name: string;
  readonly isPaid: boolean;
  isAvailable(): boolean;
  translate(text: string, sourceLang: string, targetLang: string): Promise<string>;
}

export interface TTSProvider {
  readonly name: string;
  readonly isPaid: boolean;
  isAvailable(): boolean;
  supportsLanguage(targetLang: string): boolean;
  synthesize(text: string, targetLang: string, voiceId?: string): Promise<Buffer>;
}

export class ProviderRateLimitError extends Error {
  public provider: string;
  public retryAfterSec: number;

  constructor(provider: string, message: string = 'Provider rate limit exceeded', retryAfterSec: number = 60) {
    super(`[${provider}] 429 Rate Limit: ${message}`);
    this.name = 'ProviderRateLimitError';
    this.provider = provider;
    this.retryAfterSec = retryAfterSec;
  }
}

export class ProviderError extends Error {
  public provider: string;
  public statusCode?: number;

  constructor(provider: string, message: string, statusCode?: number) {
    super(`[${provider}] Error: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
  }
}
