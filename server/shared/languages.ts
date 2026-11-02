import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface VoiceMetadata {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  neural: boolean;
  provider: 'edge' | 'xai' | 'groq';
}

export interface LanguageEntry {
  display_name: string;
  iso_code: string;
  whisper_code: string;
  translate_code: string;
  stt_supported: boolean;
  translate_supported: boolean;
  default_voice: string;
  voices: VoiceMetadata[];
}

export interface LanguageRegistryData {
  metadata: {
    version: string;
    description: string;
  };
  languages: Record<string, LanguageEntry>;
}

let _cachedRegistry: LanguageRegistryData | null = null;

export const LOCALE_ALIASES: Record<string, string> = {
  en: 'en-US',
  es: 'es-US',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  pt: 'pt-BR',
  zh: 'zh-CN',
  hi: 'hi-IN',
  ar: 'ar-AE',
  ru: 'ru-RU',
  nl: 'nl-NL',
  tr: 'tr-TR',
  sv: 'sv-SE',
  pl: 'pl-PL',
  da: 'da-DK',
  nb: 'nb-NO',
  no: 'nb-NO',
  fi: 'fi-FI',
};

export function loadRegistry(): LanguageRegistryData {
  if (_cachedRegistry) {
    return _cachedRegistry;
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const possiblePaths = [
    path.resolve(process.cwd(), 'data/language_registry.json'),
    path.resolve(process.cwd(), '../data/language_registry.json'),
    path.resolve(currentDir, '../../data/language_registry.json'),
    path.resolve(currentDir, '../../../data/language_registry.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      _cachedRegistry = JSON.parse(content) as LanguageRegistryData;
      return _cachedRegistry;
    }
  }

  throw new Error('Language registry file not found at data/language_registry.json');
}

export function normalizeLocale(locale?: string | null): string | null {
  if (!locale) return null;
  const clean = locale.trim();
  if (clean.toLowerCase() === 'auto') return 'auto';

  const lower = clean.toLowerCase();
  if (LOCALE_ALIASES[lower]) {
    return LOCALE_ALIASES[lower];
  }

  const registry = loadRegistry();
  for (const regKey of Object.keys(registry.languages)) {
    if (regKey.toLowerCase() === lower) {
      return regKey;
    }
  }

  const prefix = clean.replace(/_/g, '-').split('-')[0].toLowerCase();
  if (LOCALE_ALIASES[prefix]) {
    return LOCALE_ALIASES[prefix];
  }

  return clean;
}

export function getLanguageInfo(locale: string): LanguageEntry | null {
  const norm = normalizeLocale(locale);
  if (!norm || norm === 'auto') return null;
  const reg = loadRegistry();
  return reg.languages[norm] || null;
}

/**
 * Validates a language pair based on currently enabled providers:
 * - Source must have STT support
 * - Target must have a voice in at least one ENABLED TTS provider
 */
export function validatePair(
  sourceLocale: string,
  targetLocale: string,
  enabledTtsProviders: string[] = ['edge']
): { valid: boolean; reason?: string } {
  const normSource = normalizeLocale(sourceLocale);
  const normTarget = normalizeLocale(targetLocale);

  if (!normSource) {
    return { valid: false, reason: 'Missing source language' };
  }
  if (!normTarget) {
    return { valid: false, reason: 'Missing target language' };
  }

  const reg = loadRegistry();

  if (normSource !== 'auto') {
    const srcInfo = reg.languages[normSource];
    if (!srcInfo || !srcInfo.stt_supported) {
      return { valid: false, reason: `Source language '${normSource}' is not supported for speech-to-text` };
    }
  }

  const tgtInfo = reg.languages[normTarget];
  if (!tgtInfo || !tgtInfo.translate_supported) {
    return { valid: false, reason: `Target language '${normTarget}' is not supported for translation` };
  }

  // Check if target has a voice in at least one enabled TTS provider
  const availableVoices = (tgtInfo.voices || []).filter((v) => enabledTtsProviders.includes(v.provider));
  if (availableVoices.length === 0) {
    return {
      valid: false,
      reason: `Target language '${normTarget}' has no available voices in enabled TTS providers (${enabledTtsProviders.join(', ')})`,
    };
  }

  return { valid: true };
}

/**
 * Resolves a TTS voice ID and provider for a target locale.
 */
export function resolveTtsVoice(
  targetLocale: string,
  preferredVoiceId?: string,
  enabledTtsProviders: string[] = ['edge']
): { voiceId: string; provider: 'edge' | 'xai' | 'groq' } {
  const norm = normalizeLocale(targetLocale) || 'en-US';
  const info = getLanguageInfo(norm);
  if (!info || !info.voices || info.voices.length === 0) {
    return { voiceId: 'en-US-JennyNeural', provider: 'edge' };
  }

  const enabledVoices = info.voices.filter((v) => enabledTtsProviders.includes(v.provider));
  const candidateVoices = enabledVoices.length > 0 ? enabledVoices : info.voices;

  if (preferredVoiceId) {
    const match = candidateVoices.find((v) => v.id === preferredVoiceId);
    if (match) {
      return { voiceId: match.id, provider: match.provider };
    }
  }

  return { voiceId: candidateVoices[0].id, provider: candidateVoices[0].provider };
}
