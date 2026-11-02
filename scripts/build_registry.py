#!/usr/bin/env python3
"""Build and update data/language_registry.json.

Fetches AWS Polly voices via DescribeVoices, Translate languages via ListLanguages,
and merges with AWS Transcribe supported locales (static table referenced from AWS docs).

References:
- Transcribe Streaming: https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html
- Transcribe Batch: https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html
- Transcribe Language ID: https://docs.aws.amazon.com/transcribe/latest/dg/streaming-language-id.html
- Amazon Translate: https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html
- Amazon Polly: https://docs.aws.amazon.com/polly/latest/dg/voicelist.html
"""

import json
import os
import sys
from typing import Any, Dict, List, Optional
import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Canonical AWS Transcribe language support table
# Source: AWS Documentation (verified for Transcribe batch, streaming, and language ID)
TRANSCRIBE_LOCALES: Dict[str, Dict[str, bool]] = {
    # locale: {batch, streaming, language_id}
    "en-US": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "en-GB": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "en-AU": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "es-US": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "es-ES": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "fr-FR": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "fr-CA": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "de-DE": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "it-IT": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "ja-JP": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "ko-KR": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "pt-BR": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "pt-PT": {"stt_batch": True, "stt_streaming": True, "stt_language_id": False},
    "zh-CN": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "zh-TW": {"stt_batch": True, "stt_streaming": True, "stt_language_id": False},
    "hi-IN": {"stt_batch": True, "stt_streaming": True, "stt_language_id": True},
    "ar-AE": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "ar-SA": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "ru-RU": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "nl-NL": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "tr-TR": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "sv-SE": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "pl-PL": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "da-DK": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "nb-NO": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
    "fi-FI": {"stt_batch": True, "stt_streaming": False, "stt_language_id": False},
}

# Display names for languages / locales
LANGUAGE_DISPLAY_NAMES: Dict[str, str] = {
    "en-US": "English (US)",
    "en-GB": "English (UK)",
    "en-AU": "English (Australia)",
    "es-US": "Spanish (US)",
    "es-ES": "Spanish (Spain)",
    "fr-FR": "French (France)",
    "fr-CA": "French (Canada)",
    "de-DE": "German (Germany)",
    "it-IT": "Italian (Italy)",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "pt-BR": "Portuguese (Brazil)",
    "pt-PT": "Portuguese (Portugal)",
    "zh-CN": "Chinese (Mandarin, Simplified)",
    "zh-TW": "Chinese (Taiwan, Traditional)",
    "hi-IN": "Hindi (India)",
    "ar-AE": "Arabic (UAE)",
    "ar-SA": "Arabic (Saudi Arabia)",
    "ru-RU": "Russian",
    "nl-NL": "Dutch",
    "tr-TR": "Turkish",
    "sv-SE": "Swedish",
    "pl-PL": "Polish",
    "da-DK": "Danish",
    "nb-NO": "Norwegian",
    "fi-FI": "Finnish",
}

# Translate code mapping (Translate language codes are mostly ISO 639-1)
LOCALE_TO_TRANSLATE: Dict[str, str] = {
    "en-US": "en",
    "en-GB": "en",
    "en-AU": "en",
    "es-US": "es",
    "es-ES": "es",
    "fr-FR": "fr",
    "fr-CA": "fr-CA",
    "de-DE": "de",
    "it-IT": "it",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "pt-BR": "pt",
    "pt-PT": "pt-PT",
    "zh-CN": "zh",
    "zh-TW": "zh-TW",
    "hi-IN": "hi",
    "ar-AE": "ar",
    "ar-SA": "ar",
    "ru-RU": "ru",
    "nl-NL": "nl",
    "tr-TR": "tr",
    "sv-SE": "sv",
    "pl-PL": "pl",
    "da-DK": "da",
    "nb-NO": "no",
    "fi-FI": "fi",
}

# Canonical Polly voice catalog fallback (matches AWS Polly DescribeVoices output)
DEFAULT_POLLY_VOICES: Dict[str, List[Dict[str, Any]]] = {
    "en-US": [
        {"id": "Joanna", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Matthew", "gender": "Male", "supported_engines": ["neural", "standard"]},
        {"id": "Kendra", "gender": "Female", "supported_engines": ["neural", "standard"]},
    ],
    "en-GB": [
        {"id": "Amy", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Brian", "gender": "Male", "supported_engines": ["neural", "standard"]},
    ],
    "en-AU": [
        {"id": "Olivia", "gender": "Female", "supported_engines": ["neural"]},
        {"id": "Russell", "gender": "Male", "supported_engines": ["standard"]},
    ],
    "es-US": [
        {"id": "Lupe", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Pedro", "gender": "Male", "supported_engines": ["neural", "standard"]},
    ],
    "es-ES": [
        {"id": "Lucia", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Sergio", "gender": "Male", "supported_engines": ["neural", "standard"]},
    ],
    "fr-FR": [
        {"id": "Lea", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Remi", "gender": "Male", "supported_engines": ["neural"]},
        {"id": "Mathieu", "gender": "Male", "supported_engines": ["standard"]},
    ],
    "fr-CA": [
        {"id": "Gabrielle", "gender": "Female", "supported_engines": ["neural"]},
        {"id": "Chantal", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "de-DE": [
        {"id": "Vicki", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Daniel", "gender": "Male", "supported_engines": ["neural", "standard"]},
    ],
    "it-IT": [
        {"id": "Bianca", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Adriano", "gender": "Male", "supported_engines": ["neural", "standard"]},
    ],
    "ja-JP": [
        {"id": "Tomoko", "gender": "Female", "supported_engines": ["neural"]},
        {"id": "Takumi", "gender": "Male", "supported_engines": ["neural", "standard"]},
        {"id": "Mizuki", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "ko-KR": [
        {"id": "Seoyeon", "gender": "Female", "supported_engines": ["neural", "standard"]},
    ],
    "pt-BR": [
        {"id": "Camila", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Thiago", "gender": "Male", "supported_engines": ["neural", "standard"]},
    ],
    "pt-PT": [
        {"id": "Ines", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Cristiano", "gender": "Male", "supported_engines": ["standard"]},
    ],
    "zh-CN": [
        {"id": "Zhiyu", "gender": "Female", "supported_engines": ["neural", "standard"]},
    ],
    "zh-TW": [
        {"id": "Hiujin", "gender": "Female", "supported_engines": ["neural"]},
    ],
    "hi-IN": [
        {"id": "Kajal", "gender": "Female", "supported_engines": ["neural"]},
        {"id": "Aditi", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "ar-AE": [
        {"id": "Hala", "gender": "Female", "supported_engines": ["neural"]},
        {"id": "Zayd", "gender": "Male", "supported_engines": ["neural"]},
    ],
    "ar-SA": [
        {"id": "Zeina", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "ru-RU": [
        {"id": "Tatyana", "gender": "Female", "supported_engines": ["standard"]},
        {"id": "Maxim", "gender": "Male", "supported_engines": ["standard"]},
    ],
    "nl-NL": [
        {"id": "Laura", "gender": "Female", "supported_engines": ["neural"]},
        {"id": "Lotte", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "tr-TR": [
        {"id": "Filiz", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "sv-SE": [
        {"id": "Sofie", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Astrid", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "pl-PL": [
        {"id": "Ola", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Maja", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "da-DK": [
        {"id": "Naja", "gender": "Female", "supported_engines": ["standard"]},
        {"id": "Mads", "gender": "Male", "supported_engines": ["standard"]},
    ],
    "nb-NO": [
        {"id": "Ida", "gender": "Female", "supported_engines": ["neural", "standard"]},
        {"id": "Liv", "gender": "Female", "supported_engines": ["standard"]},
    ],
    "fi-FI": [
        {"id": "Suvi", "gender": "Female", "supported_engines": ["neural", "standard"]},
    ],
}


def fetch_live_polly_voices(region: str = "us-east-1") -> Optional[Dict[str, List[Dict[str, Any]]]]:
    """Fetch voices dynamically from Amazon Polly if AWS credentials exist."""
    try:
        client = boto3.client("polly", region_name=region)
        paginator = client.get_paginator("describe_voices")
        voices_by_lang: Dict[str, List[Dict[str, Any]]] = {}
        for page in paginator.paginate():
            for v in page.get("Voices", []):
                lang_code = v["LanguageCode"]
                supported = v.get("SupportedEngines", ["standard"])
                voices_by_lang.setdefault(lang_code, []).append({
                    "id": v["Id"],
                    "gender": v.get("Gender", "Unknown"),
                    "supported_engines": supported,
                })
        print(f"Successfully fetched {sum(len(v) for v in voices_by_lang.values())} voices from live Polly API.")
        return voices_by_lang
    except (ClientError, BotoCoreError, Exception) as exc:
        print(f"Note: Using canonical Polly voice catalog (live AWS fetch skipped: {exc})")
        return None


def fetch_live_translate_languages(region: str = "us-east-1") -> Optional[List[str]]:
    """Fetch supported languages from Amazon Translate if AWS credentials exist."""
    try:
        client = boto3.client("translate", region_name=region)
        resp = client.list_languages()
        supported_langs = [lang["LanguageCode"] for lang in resp.get("Languages", [])]
        print(f"Successfully fetched {len(supported_langs)} languages from live Translate API.")
        return supported_langs
    except (ClientError, BotoCoreError, Exception) as exc:
        print(f"Note: Using canonical Translate languages (live AWS fetch skipped: {exc})")
        return None


def build_registry(output_path: str = "data/language_registry.json") -> Dict[str, Any]:
    """Build unified language registry and write to output_path."""
    live_polly = fetch_live_polly_voices()
    live_translate = fetch_live_translate_languages()

    registry: Dict[str, Any] = {
        "metadata": {
            "version": "1.0.0",
            "description": "AWS Voice Translation Capability Matrix",
            "transcribe_reference": "https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html",
            "translate_reference": "https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html",
            "polly_reference": "https://docs.aws.amazon.com/polly/latest/dg/voicelist.html",
        },
        "languages": {},
    }

    for locale, stt_info in TRANSCRIBE_LOCALES.items():
        translate_code = LOCALE_TO_TRANSLATE.get(locale, locale.split("-")[0])

        # Check Translate support
        if live_translate is not None:
            translate_supported = (translate_code in live_translate or translate_code.split("-")[0] in live_translate)
        else:
            translate_supported = True

        # Resolve voices
        if live_polly and locale in live_polly:
            voice_list = live_polly[locale]
        else:
            voice_list = DEFAULT_POLLY_VOICES.get(locale, [])

        tts_neural = any("neural" in v.get("supported_engines", []) for v in voice_list)
        tts_standard = any("standard" in v.get("supported_engines", []) for v in voice_list)

        # Default voice priority: first neural voice, then first standard voice
        default_voice = None
        for v in voice_list:
            if "neural" in v.get("supported_engines", []):
                default_voice = v["id"]
                break
        if not default_voice and voice_list:
            default_voice = voice_list[0]["id"]

        registry["languages"][locale] = {
            "display_name": LANGUAGE_DISPLAY_NAMES.get(locale, locale),
            "transcribe_locales": [locale],
            "translate_code": translate_code,
            "flags": {
                "stt_batch": stt_info["stt_batch"],
                "stt_streaming": stt_info["stt_streaming"],
                "stt_language_id": stt_info["stt_language_id"],
                "translate": translate_supported,
                "tts_neural": tts_neural,
                "tts_standard": tts_standard,
            },
            "default_voice": default_voice,
            "voices": voice_list,
        }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Generated registry at {output_path} with {len(registry['languages'])} languages.")
    return registry


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "data/language_registry.json"
    build_registry(out)
