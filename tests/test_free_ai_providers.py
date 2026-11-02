"""Unit tests for free AI providers (Groq Whisper, Groq LLaMA, Microsoft Edge-TTS)."""

import os
import pytest
from unittest.mock import MagicMock, patch

from src.shared.ai_providers import (
    transcribe_speech,
    translate_text,
    synthesize_speech,
    get_active_provider,
    _transcribe_with_groq,
    _translate_with_groq,
    _synthesize_with_edge_tts,
    EDGE_TTS_VOICE_MAP,
)
from src.shared.audio import create_sine_pcm


def test_active_provider_resolution(monkeypatch):
    """Verify provider selection from environment and settings."""
    monkeypatch.setenv("AI_PROVIDER", "groq")
    assert get_active_provider() == "groq"

    monkeypatch.setenv("AI_PROVIDER", "aws")
    assert get_active_provider() == "aws"

    assert get_active_provider(custom_provider="groq") == "groq"


def test_groq_whisper_stt(monkeypatch):
    """Verify Groq Whisper STT endpoint payload handling."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_mock_key_12345")
    test_pcm = create_sine_pcm(duration_sec=1.0)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "text": "Hello, how can I help you today?",
        "language": "en",
    }

    with patch("requests.post", return_value=mock_resp) as mock_post:
        transcript, lang, conf = _transcribe_with_groq(test_pcm, sample_rate=16000)

        assert transcript == "Hello, how can I help you today?"
        assert lang == "en-US"
        assert conf > 0.9
        assert mock_post.called
        assert "audio/transcriptions" in mock_post.call_args[0][0]


def test_groq_llama_translation(monkeypatch):
    """Verify Groq LLaMA translation prompt and output parsing."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_mock_key_12345")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": "¿Dónde está la estación de tren más cercana?"
                }
            }
        ]
    }

    with patch("requests.post", return_value=mock_resp) as mock_post:
        result = _translate_with_groq(
            text="Where is the nearest train station?",
            source_lang="en-US",
            target_lang="es-ES",
        )
        assert result == "¿Dónde está la estación de tren más cercana?"
        assert mock_post.called
        assert "chat/completions" in mock_post.call_args[0][0]


def test_edge_tts_speech_synthesis():
    """Verify Microsoft Edge-TTS synthesizes high quality audio decoded to 16kHz PCM."""
    pcm_bytes = _synthesize_with_edge_tts(
        text="Bonjour tout le monde",
        target_lang="fr-FR",
        output_format="pcm",
    )
    # Output must be 16-bit PCM (multiple of 2 bytes) and non-empty
    assert isinstance(pcm_bytes, bytes)
    assert len(pcm_bytes) > 1000
    assert len(pcm_bytes) % 2 == 0


def test_edge_tts_voice_catalog():
    """Verify Edge-TTS voice mapping covers all canonical languages."""
    for locale in ["en-US", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN", "hi-IN"]:
        assert locale in EDGE_TTS_VOICE_MAP
        assert EDGE_TTS_VOICE_MAP[locale].endswith("Neural")
