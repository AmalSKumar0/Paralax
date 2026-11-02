import { loadRegistry, validatePair, normalizeLocale } from '../server/shared/languages.js';

function checkRegistry() {
  console.log('--- Checking Language Registry ---');
  const registry = loadRegistry();
  const languages = registry.languages;
  const count = Object.keys(languages).length;
  console.log(`Loaded ${count} language definitions.`);

  let errors = 0;
  let warnings = 0;

  for (const [code, lang] of Object.entries(languages)) {
    if (!lang.display_name) {
      console.error(`[ERROR] ${code}: Missing display_name`);
      errors++;
    }
    if (!lang.iso_code) {
      console.error(`[ERROR] ${code}: Missing iso_code`);
      errors++;
    }
    if (!lang.whisper_code) {
      console.warn(`[WARN] ${code}: Missing whisper_code`);
      warnings++;
    }
    if (!lang.voices || lang.voices.length === 0) {
      console.warn(`[WARN] ${code}: No voices configured`);
      warnings++;
    } else {
      for (const v of lang.voices) {
        if (!v.id || !v.name || !v.provider) {
          console.error(`[ERROR] ${code}: Malformed voice object ${JSON.stringify(v)}`);
          errors++;
        }
      }
    }
  }

  // Test sample translation pairs
  const testPairs = [
    ['en-US', 'es-US'],
    ['es-US', 'en-US'],
    ['en', 'fr'],
    ['auto', 'de-DE'],
    ['hi-IN', 'en-US'],
    ['zh-CN', 'en-US'],
    ['ja-JP', 'en-US']
  ];

  for (const [src, tgt] of testPairs) {
    const res = validatePair(src, tgt, ['edge', 'xai']);
    if (!res.valid) {
      console.error(`[ERROR] Pair ${src} -> ${tgt} failed validation: ${res.reason}`);
      errors++;
    } else {
      console.log(`  ✓ Pair ${src} -> ${tgt} is valid`);
    }
  }

  console.log('\n--- Registry Check Results ---');
  console.log(`Total Languages: ${count}`);
  console.log(`Errors: ${errors}`);
  console.log(`Warnings: ${warnings}`);

  if (errors > 0) {
    console.error('Registry validation failed.');
    process.exit(1);
  } else {
    console.log('Registry validation passed successfully!');
  }
}

checkRegistry();
