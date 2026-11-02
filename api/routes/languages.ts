import { Hono } from 'hono';
import { loadRegistry, validatePair } from '../shared/languages.js';

export const languageRoutes = new Hono();

languageRoutes.get('/', async (c) => {
  const registry = loadRegistry();
  const enabledTts = (process.env.TTS_PROVIDERS || 'edge,xai')
    .split(',')
    .map((s) => s.trim().toLowerCase());

  const languageEntries = Object.entries(registry.languages);
  const allCodes = languageEntries.map(([code]) => code);

  const formattedLanguages = languageEntries.map(([code, entry]) => {
    // Check TTS voices available in enabled providers
    const activeVoices = (entry.voices || []).filter((v) => enabledTts.includes(v.provider));

    const hasStt = Boolean(entry.stt_supported);
    const hasTranslate = Boolean(entry.translate_supported);
    const hasTts = activeVoices.length > 0;

    // Calculate valid targets for this source language
    const validTargets = hasStt
      ? allCodes.filter((targetCode) => {
          if (targetCode === code) return false;
          return validatePair(code, targetCode, enabledTts).valid;
        })
      : [];

    return {
      code,
      name: entry.display_name,
      iso_code: entry.iso_code,
      whisper_code: entry.whisper_code,
      capabilities: {
        stt: hasStt,
        translate: hasTranslate,
        tts: hasTts,
        // Backwards compatibility aliases for older UI components
        stt_streaming: false,
        stt_batch: hasStt,
        stt_language_id: hasStt,
        tts_neural: hasTts,
        tts_standard: hasTts,
      },
      valid_targets: validTargets,
      voices: activeVoices.map((v) => ({
        id: v.id,
        name: v.name,
        gender: v.gender,
        neural: v.neural,
        provider: v.provider,
      })),
    };
  });

  return c.json({
    languages: formattedLanguages,
    total: formattedLanguages.length,
    enabled_tts_providers: enabledTts,
  });
});
