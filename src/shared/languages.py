"""Language Capability Registry module.

Loads data/language_registry.json and validates language pairs against AWS Transcribe,
Amazon Translate, and Amazon Polly capabilities.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "language_registry.json"

_REGISTRY_CACHE: Optional[Dict[str, Any]] = None

# Fallback locale mappings when client passes a base language or short code
LOCALE_ALIASES: Dict[str, str] = {
    "en": "en-US",
    "es": "es-US",
    "fr": "fr-FR",
    "de": "de-DE",
    "it": "it-IT",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "pt": "pt-BR",
    "zh": "zh-CN",
    "hi": "hi-IN",
    "ar": "ar-AE",
    "ru": "ru-RU",
    "nl": "nl-NL",
    "tr": "tr-TR",
    "sv": "sv-SE",
    "pl": "pl-PL",
    "da": "da-DK",
    "nb": "nb-NO",
    "no": "nb-NO",
    "fi": "fi-FI",
}


def load_registry(custom_path: Optional[str] = None) -> Dict[str, Any]:
    """Load language registry from disk or return cached."""
    global _REGISTRY_CACHE
    if _REGISTRY_CACHE is not None and not custom_path:
        return _REGISTRY_CACHE

    path = Path(custom_path) if custom_path else REGISTRY_PATH
    if not path.exists():
        raise FileNotFoundError(f"Language registry file not found at {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not custom_path:
        _REGISTRY_CACHE = data
    return data


def normalize_locale(code: Optional[str]) -> Optional[str]:
    """Normalize input locale or short code into a canonical registry locale.
    
    Examples:
        'en' -> 'en-US'
        'es' -> 'es-US'
        'en-us' -> 'en-US'
        'zh-cn' -> 'zh-CN'
    """
    if not code:
        return None
    code_clean = code.strip()
    if code_clean.lower() == "auto":
        return "auto"

    # Exact match in aliases
    if code_clean.lower() in LOCALE_ALIASES:
        return LOCALE_ALIASES[code_clean.lower()]

    # Case-insensitive match against registry keys
    registry = load_registry()
    for reg_key in registry.get("languages", {}):
        if reg_key.lower() == code_clean.lower():
            return reg_key

    # Check language prefix fallback (e.g. en-CA -> en-US if en-CA not present)
    parts = code_clean.replace("_", "-").split("-")
    lang_prefix = parts[0].lower()
    if lang_prefix in LOCALE_ALIASES:
        return LOCALE_ALIASES[lang_prefix]

    return code_clean


def get_language_info(locale: str) -> Optional[Dict[str, Any]]:
    """Retrieve language metadata for a given normalized locale."""
    norm = normalize_locale(locale)
    if not norm or norm == "auto":
        return None
    registry = load_registry()
    return registry.get("languages", {}).get(norm)


def list_languages() -> Dict[str, Any]:
    """Return all languages in the registry."""
    registry = load_registry()
    return registry.get("languages", {})


def validate_pair(
    source: str,
    target: str,
    is_path_a: bool = True,
    is_auto: bool = False,
) -> Tuple[bool, Optional[str]]:
    """Validate directional language pair S -> T.
    
    Rules:
    - Target must exist in registry.
    - Target cannot be 'auto'.
    - Target must have translate support and at least one Polly voice.
    - Source must exist in registry (unless is_auto is True).
    - If is_auto is True:
        - Source is 'auto'. Language ID support is required on the pair or candidate pair.
    - If is_path_a (Utterance streaming):
        - Source must support stt_streaming.
    - If not is_path_a (Batch file jobs):
        - Source must support stt_batch.
    - Target must support translate and tts (either neural or standard).
    - Source and target cannot be the same locale if both are explicitly provided.
    
    Returns:
        (is_valid, error_reason)
    """
    target_norm = normalize_locale(target)
    if not target_norm or target_norm == "auto":
        return False, "Target language cannot be auto or empty."

    target_info = get_language_info(target_norm)
    if not target_info:
        return False, f"Target language '{target}' is not supported in language registry."

    target_flags = target_info.get("flags", {})
    if not target_flags.get("translate"):
        return False, f"Target language '{target_norm}' does not support Amazon Translate."

    if not (target_flags.get("tts_neural") or target_flags.get("tts_standard")):
        return False, f"Target language '{target_norm}' does not have any Polly voices."

    source_norm = normalize_locale(source)
    if is_auto or source_norm == "auto":
        # When source is auto, validate that target is valid
        return True, None

    if not source_norm:
        return False, "Source language cannot be empty."

    if source_norm == target_norm:
        return False, f"Source and target languages cannot be identical ('{source_norm}')."

    source_info = get_language_info(source_norm)
    if not source_info:
        return False, f"Source language '{source}' is not supported in language registry."

    source_flags = source_info.get("flags", {})

    if is_path_a:
        if not source_flags.get("stt_streaming"):
            return False, f"Source language '{source_norm}' does not support streaming transcription (required for Path A)."
    else:
        if not source_flags.get("stt_batch"):
            return False, f"Source language '{source_norm}' does not support batch transcription (required for Path B)."

    return True, None


def validate_auto_pair_candidates(lang_a: str, lang_b: str) -> Tuple[bool, Optional[str]]:
    """Validate that a two-way language pair (e.g. device config) supports auto-detection.
    
    Both languages must support streaming STT and streaming language identification.
    Both must have translate support and TTS voices.
    """
    norm_a = normalize_locale(lang_a)
    norm_b = normalize_locale(lang_b)

    if not norm_a or not norm_b:
        return False, "Both language_a and language_b must be specified."

    if norm_a == norm_b:
        return False, "language_a and language_b must be different languages."

    info_a = get_language_info(norm_a)
    info_b = get_language_info(norm_b)

    if not info_a:
        return False, f"language_a '{lang_a}' not in registry."
    if not info_b:
        return False, f"language_b '{lang_b}' not in registry."

    flags_a = info_a.get("flags", {})
    flags_b = info_b.get("flags", {})

    # Streaming STT check
    if not flags_a.get("stt_streaming"):
        return False, f"language_a '{norm_a}' does not support streaming STT."
    if not flags_b.get("stt_streaming"):
        return False, f"language_b '{norm_b}' does not support streaming STT."

    # Language ID check
    if not flags_a.get("stt_language_id"):
        return False, f"language_a '{norm_a}' does not support streaming Language Identification (required for auto mode)."
    if not flags_b.get("stt_language_id"):
        return False, f"language_b '{norm_b}' does not support streaming Language Identification (required for auto mode)."

    # Translate and TTS checks
    if not flags_a.get("translate") or not (flags_a.get("tts_neural") or flags_a.get("tts_standard")):
        return False, f"language_a '{norm_a}' lacks translation or TTS voice support."
    if not flags_b.get("translate") or not (flags_b.get("tts_neural") or flags_b.get("tts_standard")):
        return False, f"language_b '{norm_b}' lacks translation or TTS voice support."

    return True, None


def resolve_polly_voice(
    target_locale: str,
    preferred_voice_id: Optional[str] = None,
    engine_preference: str = "neural",
) -> Tuple[str, str]:
    """Resolve Polly voice ID and engine ('neural' vs 'standard').
    
    Returns:
        (voice_id, engine)
    """
    info = get_language_info(target_locale)
    if not info:
        raise ValueError(f"Unknown target locale: {target_locale}")

    voices = info.get("voices", [])
    if not voices:
        raise ValueError(f"No Polly voices available for locale: {target_locale}")

    # If preferred voice is specified and matches a valid voice
    if preferred_voice_id:
        for v in voices:
            if v["id"].lower() == preferred_voice_id.lower():
                supported = v.get("supported_engines", ["standard"])
                if engine_preference in supported:
                    return v["id"], engine_preference
                return v["id"], supported[0]

    # Otherwise search by engine preference
    for v in voices:
        if engine_preference in v.get("supported_engines", []):
            return v["id"], engine_preference

    # Fallback to standard
    for v in voices:
        if "standard" in v.get("supported_engines", []):
            return v["id"], "standard"

    # Fallback to first available
    first = voices[0]
    return first["id"], first.get("supported_engines", ["standard"])[0]


def get_translate_code(locale: str) -> str:
    """Return the Amazon Translate language code for a locale."""
    info = get_language_info(locale)
    if info and info.get("translate_code"):
        return info["translate_code"]
    norm = normalize_locale(locale)
    if norm:
        return norm.split("-")[0]
    return "en"


def get_transcribe_locale(locale: str) -> str:
    """Return the canonical Amazon Transcribe locale code."""
    norm = normalize_locale(locale)
    return norm if norm else "en-US"
