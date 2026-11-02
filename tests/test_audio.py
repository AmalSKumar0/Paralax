"""Tests for audio validation, PCM/WAV parsing, and silence detection."""

import pytest
from src.shared.audio import (
    parse_and_validate_audio,
    calculate_pcm_rms,
    pcm_to_wav,
    create_sine_pcm,
    AudioValidationError,
)


def test_valid_pcm_audio():
    """Verify normal audible PCM audio parses correctly."""
    # 1.5 seconds of 440 Hz audible tone
    pcm = create_sine_pcm(frequency_hz=440, duration_sec=1.5, amplitude=12000)
    raw_pcm, duration, rate = parse_and_validate_audio(pcm, max_duration_sec=15.0)

    assert raw_pcm == pcm
    assert pytest.approx(duration, rel=1e-2) == 1.5
    assert rate == 16000


def test_valid_wav_audio():
    """Verify standard WAV container is unwrapped to PCM."""
    pcm = create_sine_pcm(frequency_hz=880, duration_sec=2.0, amplitude=15000)
    wav_bytes = pcm_to_wav(pcm, sample_rate=16000, channels=1, bits_per_sample=16)

    raw_pcm, duration, rate = parse_and_validate_audio(wav_bytes, max_duration_sec=15.0)
    assert raw_pcm == pcm
    assert pytest.approx(duration, rel=1e-2) == 2.0
    assert rate == 16000


def test_audio_too_long():
    """Verify audio exceeding max duration raises audio_too_long."""
    pcm = create_sine_pcm(duration_sec=5.0, amplitude=10000)
    with pytest.raises(AudioValidationError) as exc:
        parse_and_validate_audio(pcm, max_duration_sec=3.0)
    assert exc.value.code == "audio_too_long"


def test_audio_too_short():
    """Verify audio under min duration raises invalid_audio_format."""
    pcm = create_sine_pcm(duration_sec=0.1, amplitude=10000)
    with pytest.raises(AudioValidationError) as exc:
        parse_and_validate_audio(pcm, min_duration_sec=0.5)
    assert exc.value.code == "invalid_audio_format"


def test_silent_audio_triggers_no_speech():
    """Verify silence raises no_speech_detected."""
    # 1 second of near-zero bytes
    silent_pcm = b"\x00" * 32000
    with pytest.raises(AudioValidationError) as exc:
        parse_and_validate_audio(silent_pcm, silence_rms_threshold=100.0)
    assert exc.value.code == "no_speech_detected"


def test_odd_byte_length_rejected():
    """Verify unaligned raw PCM bytes raise invalid_audio_format."""
    odd_bytes = b"\x00\x01\x02"
    with pytest.raises(AudioValidationError) as exc:
        parse_and_validate_audio(odd_bytes)
    assert exc.value.code == "invalid_audio_format"


def test_invalid_wav_sample_rate():
    """Verify 44.1kHz or 8kHz WAV is rejected."""
    pcm = create_sine_pcm(sample_rate=8000, duration_sec=1.0)
    wav_8k = pcm_to_wav(pcm, sample_rate=8000, channels=1, bits_per_sample=16)
    with pytest.raises(AudioValidationError) as exc:
        parse_and_validate_audio(wav_8k)
    assert exc.value.code == "invalid_audio_format"
    assert "16000" in exc.value.message
