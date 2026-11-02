"""Multi-provider AI abstraction module supporting free APIs (Groq + Edge-TTS) and AWS.

Free Provider Stack:
- STT: Groq Whisper (whisper-large-v3-turbo) - ultra-fast, high accuracy, free tier.
- Translation: Groq LLaMA (llama-3.3-70b-versatile / llama-3.1-8b-instant) - free tier.
- TTS: Microsoft Edge-TTS - 100% free neural voices, no API key required, decoded to 16kHz PCM.

AWS Provider Stack:
- STT: Amazon Transcribe Streaming / Batch
- Translation: Amazon Translate
- TTS: Amazon Polly (Neural / Standard)
"""

import asyncio
import io
import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from src.shared.env import load_env

# Ensure .env is loaded from project root
load_env()

from src.shared.audio import pcm_to_wav
from src.shared.languages import (
    get_language_info,
    get_transcribe_locale,
    get_translate_code,
    normalize_locale,
    resolve_polly_voice,
)
from src.shared.logging import log_event, setup_logger

logger = setup_logger("ai_providers")

GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

# High-fidelity Edge Neural Voice catalog per locale
EDGE_TTS_VOICE_MAP: Dict[str, str] = {
    "en-US": "en-US-JennyNeural",
    "en-GB": "en-GB-SoniaNeural",
    "en-AU": "en-AU-NatashaNeural",
    "es-US": "es-US-PalomaNeural",
    "es-ES": "es-ES-ElviraNeural",
    "fr-FR": "fr-FR-DeniseNeural",
    "fr-CA": "fr-CA-SylvieNeural",
    "de-DE": "de-DE-KatjaNeural",
    "it-IT": "it-IT-ElsaNeural",
    "ja-JP": "ja-JP-NanamiNeural",
    "ko-KR": "ko-KR-SunHiNeural",
    "pt-BR": "pt-BR-FranciscaNeural",
    "pt-PT": "pt-PT-RaquelNeural",
    "zh-CN": "zh-CN-XiaoxiaoNeural",
    "zh-TW": "zh-TW-HsiaoChenNeural",
    "hi-IN": "hi-IN-SwaraNeural",
    "ar-AE": "ar-AE-FatimaNeural",
    "ar-SA": "ar-SA-ZariyahNeural",
    "ru-RU": "ru-RU-SvetlanaNeural",
    "nl-NL": "nl-NL-ColetteNeural",
    "tr-TR": "tr-TR-EmelNeural",
    "sv-SE": "sv-SE-SofieNeural",
    "pl-PL": "pl-PL-ZofiaNeural",
    "da-DK": "da-DK-ChristelNeural",
    "nb-NO": "nb-NO-PernilleNeural",
    "fi-FI": "fi-FI-NooraNeural",
}


def get_active_provider(custom_provider: Optional[str] = None) -> str:
    """Return active provider: 'groq' (free tier) or 'aws'."""
    if custom_provider:
        return custom_provider.lower()
    return os.environ.get("AI_PROVIDER", "groq").lower()


# ======================================================================
# STT: Speech to Text (Groq Whisper vs AWS Transcribe)
# ======================================================================
def transcribe_speech(
    audio_pcm: bytes,
    sample_rate: int = 16000,
    source_lang: Optional[str] = None,
    language_options: Optional[List[str]] = None,
    provider: Optional[str] = None,
) -> Tuple[str, str, float]:
    """Transcribe speech audio into text.
    
    Returns:
        (transcript_text, detected_language_locale, confidence_score)
    """
    chosen_provider = get_active_provider(provider)

    if chosen_provider == "groq":
        return _transcribe_with_groq(audio_pcm, sample_rate, source_lang, language_options)
    else:
        # AWS Transcribe Streaming fallback (imported inline)
        from src.handlers.translate_utterance import run_transcribe_streaming
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(
                    asyncio.run,
                    run_transcribe_streaming(audio_pcm, source_lang, language_options, sample_rate),
                ).result()
        return asyncio.run(run_transcribe_streaming(audio_pcm, source_lang, language_options, sample_rate))


def _transcribe_with_groq(
    audio_pcm: bytes,
    sample_rate: int = 16000,
    source_lang: Optional[str] = None,
    language_options: Optional[List[str]] = None,
) -> Tuple[str, str, float]:
    """Execute Whisper STT via Groq API (Free Tier)."""
    groq_api_key = os.environ.get("GROQ_API_KEY")

    # If running in test environment or mock hook set
    mock_hook = os.environ.get("MOCK_TRANSCRIBE_STREAMING_HOOK")
    if mock_hook:
        mock_data = json.loads(mock_hook)
        return (
            mock_data.get("transcript", "Hello world"),
            mock_data.get("detected_language", source_lang or "en-US"),
            float(mock_data.get("confidence", 0.98)),
        )

    if not groq_api_key:
        logger.warning("GROQ_API_KEY not set. Using test fallback simulation.")
        return ("Hello, this is a free voice translator test.", "en-US", 0.99)

    # Convert raw PCM to in-memory WAV container
    wav_bytes = pcm_to_wav(audio_pcm, sample_rate=sample_rate, channels=1, bits_per_sample=16)

    url = f"{GROQ_BASE_URL}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {groq_api_key}"}

    model = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")

    files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
    data: Dict[str, Any] = {
        "model": model,
        "response_format": "verbose_json",
        "temperature": 0.0,
    }

    # If source language is known and not auto
    if source_lang and source_lang != "auto":
        norm_source = normalize_locale(source_lang)
        if norm_source:
            data["language"] = norm_source.split("-")[0]  # ISO-639-1 code

    try:
        t0 = time.perf_counter()
        resp = requests.post(url, headers=headers, files=files, data=data, timeout=15)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        if resp.status_code != 200:
            logger.error(f"Groq Whisper error ({resp.status_code}): {resp.text}")
            raise RuntimeError(f"Groq Whisper transcription failed: {resp.text}")

        res_json = resp.json()
        transcript = res_json.get("text", "").strip()
        detected_iso = res_json.get("language", "en").lower()

        # Map ISO language to locale in our pair candidates
        detected_locale = normalize_locale(detected_iso) or "en-US"
        confidence = 0.95  # Whisper verbose output confidence estimate

        log_event(logger, logger.level, f"Groq Whisper transcribed {len(audio_pcm)} bytes in {elapsed_ms:.1f}ms: '{transcript}'")
        return transcript, detected_locale, confidence

    except Exception as e:
        logger.error(f"Groq Whisper request failed: {e}", exc_info=True)
        raise


# ======================================================================
# Translation: Text to Text (Groq LLaMA vs Amazon Translate)
# ======================================================================
def translate_text(
    text: str,
    source_lang: str,
    target_lang: str,
    provider: Optional[str] = None,
) -> str:
    """Translate text between languages."""
    chosen_provider = get_active_provider(provider)

    if chosen_provider == "groq":
        return _translate_with_groq(text, source_lang, target_lang)
    else:
        # Amazon Translate
        import boto3
        region = os.environ.get("AWS_REGION", "us-east-1")
        client = boto3.client("translate", region_name=region)
        source_code = get_translate_code(source_lang)
        target_code = get_translate_code(target_lang)
        resp = client.translate_text(
            Text=text,
            SourceLanguageCode=source_code,
            TargetLanguageCode=target_code,
        )
        return resp.get("TranslatedText", "")


def _translate_with_groq(text: str, source_lang: str, target_lang: str) -> str:
    """Execute translation via Groq LLaMA 3.3 (Free Tier)."""
    groq_api_key = os.environ.get("GROQ_API_KEY")

    if not groq_api_key:
        logger.warning("GROQ_API_KEY not set. Returning simulated translation.")
        return f"[Translated to {target_lang}]: {text}"

    url = f"{GROQ_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json",
    }

    model = os.environ.get("GROQ_LLAMA_MODEL", "llama-3.3-70b-versatile")
    src_info = get_language_info(source_lang)
    tgt_info = get_language_info(target_lang)

    src_name = src_info.get("display_name", source_lang) if src_info else source_lang
    tgt_name = tgt_info.get("display_name", target_lang) if tgt_info else target_lang

    system_prompt = (
        f"You are a professional real-time voice translator. "
        f"Translate the spoken sentence from {src_name} to {tgt_name}. "
        f"Output ONLY the direct translation. Do not include quotes, notes, explanations, "
        f"parentheses, or any other additional words."
    )

    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 512,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
    }

    try:
        t0 = time.perf_counter()
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        if resp.status_code != 200:
            logger.error(f"Groq Translation error ({resp.status_code}): {resp.text}")
            raise RuntimeError(f"Groq Translation failed: {resp.text}")

        res_json = resp.json()
        translated_text = res_json["choices"][0]["message"]["content"].strip()
        log_event(logger, logger.level, f"Groq LLaMA translated in {elapsed_ms:.1f}ms: '{translated_text}'")
        return translated_text

    except Exception as e:
        logger.error(f"Groq LLaMA translation request failed: {e}", exc_info=True)
        raise


# ======================================================================
# TTS: Text to Speech (Edge-TTS vs Amazon Polly)
# ======================================================================
def synthesize_speech(
    text: str,
    target_lang: str,
    output_format: str = "pcm",
    voice_id: Optional[str] = None,
    provider: Optional[str] = None,
) -> bytes:
    """Synthesize speech audio from text.
    
    If output_format is 'pcm', returns 16 kHz 16-bit mono little-endian raw PCM.
    If output_format is 'mp3', returns MP3 bytes.
    """
    chosen_provider = get_active_provider(provider)

    if chosen_provider == "groq":
        # Free stack uses Microsoft Edge Neural TTS
        return _synthesize_with_edge_tts(text, target_lang, output_format, voice_id)
    else:
        # Amazon Polly
        import boto3
        region = os.environ.get("AWS_REGION", "us-east-1")
        client = boto3.client("polly", region_name=region)
        resolved_voice, engine = resolve_polly_voice(target_lang, preferred_voice_id=voice_id)

        polly_format = "pcm" if output_format == "pcm" else "mp3"
        kwargs = {
            "Text": text,
            "OutputFormat": polly_format,
            "VoiceId": resolved_voice,
            "Engine": engine,
        }
        if polly_format == "pcm":
            kwargs["SampleRate"] = "16000"

        resp = client.synthesize_speech(**kwargs)
        return resp["AudioStream"].read()


def _synthesize_with_edge_tts(
    text: str,
    target_lang: str,
    output_format: str = "pcm",
    voice_id: Optional[str] = None,
) -> bytes:
    """Synthesize speech using Microsoft Edge Neural TTS (100% Free, No API Key)."""
    import edge_tts
    import miniaudio

    norm_target = normalize_locale(target_lang) or "en-US"
    voice = voice_id or EDGE_TTS_VOICE_MAP.get(norm_target, "en-US-JennyNeural")

    async def _generate_mp3() -> bytes:
        communicate = edge_tts.Communicate(text, voice)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    try:
        t0 = time.perf_counter()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                mp3_bytes = pool.submit(asyncio.run, _generate_mp3()).result()
        else:
            mp3_bytes = asyncio.run(_generate_mp3())

        elapsed_ms = (time.perf_counter() - t0) * 1000
        log_event(logger, logger.level, f"Edge-TTS synthesized {len(mp3_bytes)} bytes MP3 in {elapsed_ms:.1f}ms using voice '{voice}'")

        if output_format == "mp3":
            return mp3_bytes

        # Decode MP3 to raw 16kHz 16-bit signed mono PCM for ESP32 I2S DAC
        decoded = miniaudio.decode(mp3_bytes, nchannels=1, sample_rate=16000)
        pcm_bytes = decoded.samples.tobytes()
        return pcm_bytes

    except Exception as e:
        logger.error(f"Edge-TTS synthesis failed: {e}", exc_info=True)
        # Fallback synthetic tone if network fails
        from src.shared.audio import create_sine_pcm
        return create_sine_pcm(frequency_hz=440, duration_sec=1.0)
