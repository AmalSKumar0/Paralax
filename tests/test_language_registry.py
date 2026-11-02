"""Tests for Language Capability Registry and validation."""

import json
from pathlib import Path
import pytest
from botocore.stub import Stubber
import boto3

from src.shared.languages import (
    load_registry,
    normalize_locale,
    validate_pair,
    validate_auto_pair_candidates,
    resolve_polly_voice,
    get_language_info,
    get_translate_code,
    get_transcribe_locale,
)
from scripts.build_registry import TRANSCRIBE_LOCALES, DEFAULT_POLLY_VOICES


def test_registry_file_structure():
    """Verify registry JSON has valid metadata and languages."""
    registry = load_registry()
    assert "metadata" in registry
    assert "languages" in registry
    langs = registry["languages"]
    assert len(langs) >= 20

    for code, info in langs.items():
        assert "display_name" in info
        assert "transcribe_locales" in info
        assert "translate_code" in info
        assert "flags" in info
        flags = info["flags"]
        for flag in ["stt_batch", "stt_streaming", "stt_language_id", "translate", "tts_neural", "tts_standard"]:
            assert flag in flags
            assert isinstance(flags[flag], bool)
        assert "voices" in info
        assert isinstance(info["voices"], list)
        if flags["tts_neural"] or flags["tts_standard"]:
            assert len(info["voices"]) > 0
            assert info["default_voice"] is not None


def test_locale_normalization():
    """Verify aliases and variant handling."""
    assert normalize_locale("en") == "en-US"
    assert normalize_locale("es") == "es-US"
    assert normalize_locale("es-es") == "es-ES"
    assert normalize_locale("zh") == "zh-CN"
    assert normalize_locale("zh-cn") == "zh-CN"
    assert normalize_locale("auto") == "auto"
    assert normalize_locale(None) is None


def test_validate_pair_path_a_and_b():
    """Verify direction validity for Path A (streaming) vs Path B (batch)."""
    # en-US -> es-ES: Valid on both paths
    valid_a, err_a = validate_pair("en-US", "es-ES", is_path_a=True)
    assert valid_a is True
    assert err_a is None

    valid_b, err_b = validate_pair("en-US", "es-ES", is_path_a=False)
    assert valid_b is True
    assert err_b is None

    # ar-AE: supports batch STT, but not streaming STT
    valid_ar_a, err_ar_a = validate_pair("ar-AE", "en-US", is_path_a=True)
    assert valid_ar_a is False
    assert "streaming" in err_ar_a.lower()

    valid_ar_b, err_ar_b = validate_pair("ar-AE", "en-US", is_path_a=False)
    assert valid_ar_b is True
    assert err_ar_b is None

    # Identical languages should be rejected
    valid_same, err_same = validate_pair("en-US", "en-US")
    assert valid_same is False
    assert "identical" in err_same.lower()

    # Target cannot be auto
    valid_auto_target, err_auto_t = validate_pair("en-US", "auto")
    assert valid_auto_target is False

    # Source as auto is permitted for Path A validation
    valid_auto_source, err_auto_s = validate_pair("auto", "es-ES", is_auto=True)
    assert valid_auto_source is True
    assert err_auto_s is None


def test_validate_auto_pair_candidates():
    """Verify two-way auto language pair checks (Language ID required)."""
    # en-US and es-US both have stt_language_id = True
    ok, err = validate_auto_pair_candidates("en-US", "es-US")
    assert ok is True
    assert err is None

    # pt-PT has stt_language_id = False
    ok_pt, err_pt = validate_auto_pair_candidates("en-US", "pt-PT")
    assert ok_pt is False
    assert "language identification" in err_pt.lower()


def test_resolve_polly_voice():
    """Verify Polly voice selection with neural preference and fallback."""
    voice_id, engine = resolve_polly_voice("en-US", engine_preference="neural")
    assert voice_id in ["Joanna", "Matthew", "Kendra"]
    assert engine == "neural"

    # Standard fallback test: Russian (ru-RU) only has standard voices
    voice_ru, engine_ru = resolve_polly_voice("ru-RU", engine_preference="neural")
    assert voice_ru in ["Tatyana", "Maxim"]
    assert engine_ru == "standard"

    # Specific preferred voice
    voice_matthew, _ = resolve_polly_voice("en-US", preferred_voice_id="Matthew")
    assert voice_matthew == "Matthew"


def test_aws_polly_drift_with_stubber():
    """Test drift detection against Polly DescribeVoices response."""
    polly = boto3.client("polly", region_name="us-east-1")
    stubber = Stubber(polly)

    stubber.add_response(
        "describe_voices",
        {
            "Voices": [
                {
                    "Id": "Joanna",
                    "LanguageCode": "en-US",
                    "SupportedEngines": ["neural", "standard"],
                    "Gender": "Female",
                },
                {
                    "Id": "Lucia",
                    "LanguageCode": "es-ES",
                    "SupportedEngines": ["neural", "standard"],
                    "Gender": "Female",
                },
            ]
        },
    )

    with stubber:
        resp = polly.describe_voices()
        registry = load_registry()
        for v in resp["Voices"]:
            code = v["LanguageCode"]
            reg_lang = registry["languages"].get(code)
            assert reg_lang is not None, f"Drift: Language {code} from Polly missing in registry"
            voice_ids = [voice["id"] for voice in reg_lang["voices"]]
            assert v["Id"] in voice_ids, f"Drift: Voice {v['Id']} for {code} missing in registry"
