"""Path A Synchronous Utterance Translation Lambda Handler.

Flow:
1. Validate service enablement, device auth context, rate limits, quotas, and idempotency.
2. Validate audio payload (raw PCM or WAV) using actual bytes and duration.
3. Transcribe audio using Amazon Transcribe Streaming (amazon-transcribe SDK).
   - If mode is 'auto', perform streaming Language Identification restricted to the device's language pair.
4. Translate transcript using Amazon Translate.
5. Synthesize speech using Amazon Polly (16 kHz 16-bit PCM mono or MP3).
6. Store input and output audio to S3 (if store_audio is enabled).
7. Record timings and update Jobs table.
8. Support binary audio responses with X-* headers when Accept: application/octet-stream.
9. Emit CloudWatch EMF metrics.
"""

import asyncio
import base64
import json
import os
import secrets
import time
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

from src.shared.audio import AudioValidationError, parse_and_validate_audio
from src.shared.db import (
    IdempotencyInProgress,
    check_and_increment_daily_quota,
    check_and_increment_rate_limit,
    complete_idempotency_record,
    create_job,
    generate_presigned_get,
    get_device,
    get_idempotency_record,
    get_settings,
    save_audio,
    set_idempotency_in_progress,
    update_job,
)
from src.shared.languages import (
    get_language_info,
    get_transcribe_locale,
    get_translate_code,
    normalize_locale,
    resolve_polly_voice,
    validate_pair,
)
from src.shared.logging import log_event, setup_logger
from src.shared.metrics import emit_translation_metrics

logger = setup_logger("translate_utterance")

# Lazy-loaded AWS clients
_TRANSLATE_CLIENT = None
_POLLY_CLIENT = None


def get_translate():
    global _TRANSLATE_CLIENT
    if _TRANSLATE_CLIENT is None:
        _TRANSLATE_CLIENT = boto3.client("translate", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _TRANSLATE_CLIENT


def get_polly():
    global _POLLY_CLIENT
    if _POLLY_CLIENT is None:
        _POLLY_CLIENT = boto3.client("polly", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _POLLY_CLIENT


def build_error_response(
    status_code: int,
    error_code: str,
    message: str,
    retry_after_sec: Optional[int] = None,
    job_id: str = "-",
    device_id: str = "-",
) -> Dict[str, Any]:
    """Generate standardized error response."""
    log_event(
        logger,
        logger.level,
        f"API Error [{status_code}] {error_code}: {message}",
        job_id=job_id,
        device_id=device_id,
        status_code=status_code,
        error_code=error_code,
    )
    error_obj: Dict[str, Any] = {"code": error_code, "message": message}
    headers: Dict[str, str] = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
    }
    if retry_after_sec is not None and retry_after_sec > 0:
        error_obj["retry_after_sec"] = retry_after_sec
        headers["Retry-After"] = str(retry_after_sec)

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps({"error": error_obj}),
    }


# ----------------------------------------------------------------------
# Transcribe Streaming Execution
# ----------------------------------------------------------------------
async def stream_audio_chunks(audio_bytes: bytes, chunk_size: int = 1024) -> AsyncGenerator[bytes, None]:
    """Stream audio chunks as fast as accepted without artificial delay."""
    for i in range(0, len(audio_bytes), chunk_size):
        yield audio_bytes[i : i + chunk_size]


async def run_transcribe_streaming(
    audio_pcm: bytes,
    language_code: Optional[str] = None,
    language_options: Optional[List[str]] = None,
    sample_rate: int = 16000,
) -> Tuple[str, str, float]:
    """Execute Amazon Transcribe Streaming using amazon-transcribe SDK.
    
    Returns:
        (transcript_text, detected_language_code, confidence_score)
    """
    from amazon_transcribe.client import TranscribeStreamingClient
    from amazon_transcribe.handlers import TranscriptResultStreamHandler
    from amazon_transcribe.model import TranscriptEvent

    transcript_parts: List[str] = []
    detected_language: Optional[str] = None
    language_confidence: float = 1.0

    class StreamHandler(TranscriptResultStreamHandler):
        async def handle_transcript_event(self, transcript_event: TranscriptEvent):
            nonlocal detected_language, language_confidence
            results = transcript_event.transcript.results
            for res in results:
                if not res.is_partial:
                    # Check for identified language
                    if res.language_code:
                        detected_language = res.language_code
                    if res.language_identification:
                        # Extract top language candidate and confidence
                        for lid in res.language_identification:
                            if lid.score is not None:
                                language_confidence = float(lid.score)
                                detected_language = lid.language_code
                                break
                    for alt in res.alternatives:
                        if alt.transcript:
                            transcript_parts.append(alt.transcript)

    region = os.environ.get("AWS_REGION", "us-east-1")
    client = TranscribeStreamingClient(region=region)

    stream_kwargs: Dict[str, Any] = {
        "media_sample_rate_hz": sample_rate,
        "media_encoding": "pcm",
    }

    if language_options and len(language_options) >= 2:
        stream_kwargs["identify_language"] = True
        stream_kwargs["language_options"] = language_options
    else:
        stream_kwargs["language_code"] = language_code or "en-US"

    try:
        stream = await client.start_stream_transcription(**stream_kwargs)
        handler = StreamHandler(stream.output_stream)

        async def send_audio():
            async for chunk in stream_audio_chunks(audio_pcm):
                await stream.input_stream.send_audio_chunk(chunk)
            await stream.input_stream.end_stream()

        await asyncio.gather(send_audio(), handler.handle_events())
    except Exception as e:
        logger.error(f"Transcribe Streaming execution failed: {str(e)}", exc_info=True)
        raise

    full_transcript = " ".join(transcript_parts).strip()
    return full_transcript, detected_language or (language_code or "en-US"), language_confidence


# ----------------------------------------------------------------------
# Lambda Handler Entrypoint
# ----------------------------------------------------------------------
def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Synchronous Path A Utterance translation entrypoint."""
    start_total_time = time.perf_counter()
    job_id = str(uuid.uuid4())

    # 1. Extract context and headers
    request_ctx = event.get("requestContext") or {}
    authorizer_ctx = request_ctx.get("authorizer") or {}
    lambda_ctx = authorizer_ctx.get("lambda") or authorizer_ctx

    # Device ID can come from authorizer context or query/header for admin test console
    device_id = lambda_ctx.get("device_id")
    headers = event.get("headers") or {}
    query_params = event.get("queryStringParameters") or {}

    # Check Settings: service_enabled
    settings = get_settings()
    if not settings.get("service_enabled", True):
        return build_error_response(503, "service_disabled", "Translation service is temporarily disabled.", job_id=job_id, device_id=device_id or "-")

    # Rate limiting & Quotas (enforced if called by device)
    if device_id:
        limit_per_min = int(settings.get("device_rate_limit_per_min", 20))
        daily_quota = int(settings.get("device_daily_quota", 500))

        rate_ok, rate_retry_sec = check_and_increment_rate_limit(device_id, limit_per_min)
        if not rate_ok:
            return build_error_response(429, "rate_limited", f"Device rate limit exceeded ({limit_per_min}/min).", retry_after_sec=rate_retry_sec, job_id=job_id, device_id=device_id)

        quota_ok, quota_retry_sec = check_and_increment_daily_quota(device_id, daily_quota)
        if not quota_ok:
            return build_error_response(429, "quota_exceeded", f"Device daily translation quota exceeded ({daily_quota}/day).", retry_after_sec=quota_retry_sec, job_id=job_id, device_id=device_id)

    # Idempotency Check
    idempotency_key = None
    for k, v in headers.items():
        if k.lower() == "idempotency-key":
            idempotency_key = v
            break

    if idempotency_key and device_id:
        existing = get_idempotency_record(device_id, idempotency_key)
        if existing:
            if existing.get("status") == "IN_PROGRESS":
                return build_error_response(409, "in_progress", "A request with this Idempotency-Key is currently running.", job_id=existing.get("job_id", job_id), device_id=device_id)
            if existing.get("status") == "COMPLETED":
                # Return cached response
                logger.info(f"Returning cached response for idempotency key {idempotency_key}", extra={"job_id": existing.get("job_id")})
                return {
                    "statusCode": 200,
                    "headers": existing.get("response_headers", {}),
                    "body": existing.get("response_body", ""),
                    "isBase64Encoded": existing.get("is_binary", False),
                }

        try:
            set_idempotency_in_progress(device_id, idempotency_key, job_id)
        except IdempotencyInProgress:
            return build_error_response(409, "in_progress", "A request with this Idempotency-Key is currently running.", job_id=job_id, device_id=device_id)

    # 2. Extract and Validate Audio Payload
    body = event.get("body") or ""
    is_base64 = event.get("isBase64Encoded", False)

    if not body:
        return build_error_response(422, "invalid_audio_format", "Audio payload is missing in request body.", job_id=job_id, device_id=device_id or "-")

    try:
        raw_audio_bytes = base64.b64decode(body) if is_base64 else (body.encode("latin-1") if isinstance(body, str) else body)
    except Exception:
        return build_error_response(422, "invalid_audio_format", "Failed to decode base64 audio payload.", job_id=job_id, device_id=device_id or "-")

    content_type_header = headers.get("content-type", headers.get("Content-Type", "audio/L16;rate=16000"))
    max_sec = float(settings.get("max_utterance_sec", 15))
    hard_cap_sec = 30.0
    allowed_max_sec = min(max_sec, hard_cap_sec)

    try:
        raw_pcm, duration_sec, sample_rate = parse_and_validate_audio(
            raw_audio_bytes,
            content_type=content_type_header,
            max_duration_sec=allowed_max_sec,
        )
    except AudioValidationError as e:
        status_code = 422
        return build_error_response(status_code, e.code, e.message, job_id=job_id, device_id=device_id or "-")

    # 3. Determine Language Direction and Modes
    # Device context or query params
    source_param = query_params.get("source") or lambda_ctx.get("source")
    target_param = query_params.get("target") or lambda_ctx.get("target")
    output_format = query_params.get("format", "pcm").lower()
    if output_format not in ["pcm", "mp3"]:
        output_format = "pcm"

    mode = lambda_ctx.get("mode", "auto")
    lang_a = lambda_ctx.get("language_a", "en-US")
    lang_b = lambda_ctx.get("language_b", "es-US")

    # If source is explicitly provided or mode is buttons
    is_auto_mode = (source_param == "auto" or (not source_param and mode == "auto"))

    if not is_auto_mode:
        source_lang = normalize_locale(source_param or lang_a)
        target_lang = normalize_locale(target_param or lang_b)
        valid, reason = validate_pair(source_lang, target_lang, is_path_a=True)
        if not valid:
            return build_error_response(422, "unsupported_language_pair", reason or "Unsupported language pair.", job_id=job_id, device_id=device_id or "-")
        language_options = None
        transcribe_lang = get_transcribe_locale(source_lang)
    else:
        # Auto mode: restricted language identification between lang_a and lang_b
        source_lang = "auto"
        norm_a = normalize_locale(lang_a)
        norm_b = normalize_locale(lang_b)
        language_options = [get_transcribe_locale(norm_a), get_transcribe_locale(norm_b)]
        transcribe_lang = None
        target_lang = norm_b  # will be flipped once speech language is identified

    # Conversation ID handling
    conversation_id = headers.get("x-conversation-id") or query_params.get("conversation_id")
    if not conversation_id:
        conversation_id = f"conv_{secrets.token_hex(8)}"

    # Create Initial Job Record
    create_job(
        job_id=job_id,
        kind="utterance",
        device_id=device_id,
        conversation_id=conversation_id,
        status="TRANSCRIBING",
        source_language=source_lang,
        target_language=target_lang or "auto",
        retention_days=int(settings.get("retention_days", 30)),
    )

    # 4. Transcribe Execution
    t_transcribe_start = time.perf_counter()
    try:
        # Check if running in mocked/stubbed test environment
        mock_hook = os.environ.get("MOCK_TRANSCRIBE_STREAMING_HOOK")
        if mock_hook:
            # Test hook for deterministic mock testing
            hook_data = json.loads(mock_hook)
            transcript_text = hook_data.get("transcript", "Hello world")
            detected_lang = hook_data.get("detected_language", transcribe_lang or language_options[0])
            confidence = float(hook_data.get("confidence", 0.95))
        else:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    transcript_text, detected_lang, confidence = pool.submit(
                        asyncio.run,
                        run_transcribe_streaming(raw_pcm, transcribe_lang, language_options, sample_rate),
                    ).result()
            else:
                transcript_text, detected_lang, confidence = asyncio.run(
                    run_transcribe_streaming(raw_pcm, transcribe_lang, language_options, sample_rate)
                )
    except Exception as e:
        logger.error(f"Transcribe step failed: {str(e)}", exc_info=True)
        update_job(job_id, {"status": "FAILED", "error": {"code": "transcribe_failed", "message": str(e)}})
        return build_error_response(500, "transcribe_failed", "Transcription service error.", job_id=job_id, device_id=device_id or "-")

    t_transcribe_end = time.perf_counter()
    transcribe_ms = round((t_transcribe_end - t_transcribe_start) * 1000, 2)

    # Check transcript emptiness
    if not transcript_text or len(transcript_text.strip()) == 0:
        update_job(job_id, {"status": "FAILED", "error": {"code": "no_speech_detected", "message": "No speech recognized."}})
        return build_error_response(422, "no_speech_detected", "No speech detected in audio utterance.", job_id=job_id, device_id=device_id or "-")

    # In Auto Mode: verify detected language and confidence
    if is_auto_mode:
        min_conf = float(settings.get("language_id_min_confidence", 0.65))
        norm_detected = normalize_locale(detected_lang)
        norm_a = normalize_locale(lang_a)
        norm_b = normalize_locale(lang_b)

        if norm_detected not in [norm_a, norm_b]:
            update_job(job_id, {"status": "FAILED", "error": {"code": "low_confidence_language", "message": f"Detected language {norm_detected} outside pair."}})
            return build_error_response(422, "low_confidence_language", f"Detected language '{norm_detected}' is outside pair ({norm_a}, {norm_b}).", job_id=job_id, device_id=device_id or "-")

        if confidence < min_conf:
            update_job(job_id, {"status": "FAILED", "error": {"code": "low_confidence_language", "message": f"Confidence {confidence:.2f} below {min_conf}."}})
            return build_error_response(422, "low_confidence_language", f"Language identification confidence ({confidence:.2f}) below threshold {min_conf}.", job_id=job_id, device_id=device_id or "-")

        # Set target to the other language in the pair!
        source_lang = norm_detected
        target_lang = norm_b if norm_detected == norm_a else norm_a
    else:
        norm_detected = source_lang

    # 5. Amazon Translate Execution
    t_translate_start = time.perf_counter()
    source_translate_code = get_translate_code(source_lang)
    target_translate_code = get_translate_code(target_lang)

    try:
        translate_client = get_translate()
        translate_resp = translate_client.translate_text(
            Text=transcript_text,
            SourceLanguageCode=source_translate_code,
            TargetLanguageCode=target_translate_code,
        )
        translated_text = translate_resp.get("TranslatedText", "")
    except Exception as e:
        logger.error(f"Translate step failed: {str(e)}", exc_info=True)
        update_job(job_id, {"status": "FAILED", "error": {"code": "translate_failed", "message": str(e)}})
        return build_error_response(500, "translate_failed", "Translation service error.", job_id=job_id, device_id=device_id or "-")

    t_translate_end = time.perf_counter()
    translate_ms = round((t_translate_end - t_translate_start) * 1000, 2)

    # 6. Amazon Polly Speech Synthesis Execution
    t_synth_start = time.perf_counter()
    voice_id, engine = resolve_polly_voice(target_lang, preferred_voice_id=None, engine_preference="neural")

    polly_format = "pcm" if output_format == "pcm" else "mp3"
    polly_sample_rate = "16000"

    try:
        polly_client = get_polly()
        synth_kwargs = {
            "Text": translated_text,
            "OutputFormat": polly_format,
            "VoiceId": voice_id,
            "Engine": engine,
        }
        if polly_format == "pcm":
            synth_kwargs["SampleRate"] = polly_sample_rate

        synth_resp = polly_client.synthesize_speech(**synth_kwargs)
        output_audio_bytes = synth_resp["AudioStream"].read()
    except Exception as e:
        logger.error(f"Polly synthesis failed: {str(e)}", exc_info=True)
        update_job(job_id, {"status": "FAILED", "error": {"code": "synthesize_failed", "message": str(e)}})
        return build_error_response(500, "synthesize_failed", "Speech synthesis error.", job_id=job_id, device_id=device_id or "-")

    t_synth_end = time.perf_counter()
    synthesize_ms = round((t_synth_end - t_synth_start) * 1000, 2)

    t_total_end = time.perf_counter()
    total_ms = round((t_total_end - start_total_time) * 1000, 2)

    # 7. S3 Audio Persistence
    input_s3_key = None
    output_s3_key = None
    store_audio_enabled = settings.get("store_audio", True)

    if store_audio_enabled:
        input_s3_key = f"utterances/{conversation_id}/{job_id}_input.pcm"
        output_s3_key = f"utterances/{conversation_id}/{job_id}_output.{output_format}"
        save_audio(input_s3_key, raw_pcm, content_type="audio/L16;rate=16000")
        out_content_type = "audio/L16;rate=16000" if output_format == "pcm" else "audio/mpeg"
        save_audio(output_s3_key, output_audio_bytes, content_type=out_content_type)

    # Calculate output duration (for PCM 16kHz 16-bit mono: 32000 bytes/sec)
    output_duration_ms = int((len(output_audio_bytes) / 32000.0) * 1000) if output_format == "pcm" else int(duration_sec * 1000)

    # Update Job Record
    job_record = {
        "status": "COMPLETED",
        "detected_language": norm_detected,
        "transcript": transcript_text,
        "translation": translated_text,
        "timings": {
            "transcribe_ms": transcribe_ms,
            "translate_ms": translate_ms,
            "synthesize_ms": synthesize_ms,
            "total_ms": total_ms,
        },
        "durations": {
            "audio_input_sec": duration_sec,
            "audio_output_sec": round(output_duration_ms / 1000.0, 2),
        },
        "audio_input_s3_key": input_s3_key,
        "audio_output_s3_key": output_s3_key,
    }
    update_job(job_id, job_record)

    # Emit CloudWatch EMF Metrics
    emit_translation_metrics(
        device_id=device_id or "system",
        source_language=norm_detected,
        target_language=target_lang,
        transcribe_ms=transcribe_ms,
        translate_ms=translate_ms,
        synthesize_ms=synthesize_ms,
        total_ms=total_ms,
        is_success=True,
        kind="utterance",
    )

    # 8. Build Response (Octet-Stream vs JSON)
    accept_header = headers.get("accept", headers.get("Accept", "application/json")).lower()

    if "application/octet-stream" in accept_header:
        # Binary audio response directly with X-* headers for single round trip
        def b64url(s: str) -> str:
            return base64.urlsafe_b64encode(s.encode("utf-8")).decode("utf-8").rstrip("=")

        resp_headers = {
            "Content-Type": "audio/L16;rate=16000" if output_format == "pcm" else "audio/mpeg",
            "X-Job-Id": job_id,
            "X-Conversation-Id": conversation_id,
            "X-Source-Language": source_lang,
            "X-Detected-Language": norm_detected,
            "X-Target-Language": target_lang,
            "X-Transcript": b64url(transcript_text),
            "X-Translation": b64url(translated_text),
            "X-Timings-Total-Ms": str(total_ms),
            "X-Timings-Transcribe-Ms": str(transcribe_ms),
            "X-Timings-Translate-Ms": str(translate_ms),
            "X-Timings-Synthesize-Ms": str(synthesize_ms),
            "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
            "Access-Control-Expose-Headers": "X-Job-Id,X-Conversation-Id,X-Source-Language,X-Detected-Language,X-Target-Language,X-Transcript,X-Translation,X-Timings-Total-Ms",
        }
        resp_body = base64.b64encode(output_audio_bytes).decode("ascii")
        is_binary = True
    else:
        # JSON response
        audio_url = generate_presigned_get(output_s3_key, expires_in=3600) if output_s3_key else None
        resp_payload = {
            "job_id": job_id,
            "conversation_id": conversation_id,
            "source_language": source_lang,
            "detected_language": norm_detected,
            "target_language": target_lang,
            "transcript": transcript_text,
            "translation": translated_text,
            "audio": {
                "url": audio_url,
                "format": output_format,
                "sample_rate": 16000,
                "duration_ms": output_duration_ms,
                "expires_in": 3600 if audio_url else 0,
            },
            "timings": {
                "transcribe_ms": transcribe_ms,
                "translate_ms": translate_ms,
                "synthesize_ms": synthesize_ms,
                "total_ms": total_ms,
            },
        }
        resp_headers = {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
        }
        resp_body = json.dumps(resp_payload)
        is_binary = False

    # Complete Idempotency record if key was provided
    if idempotency_key and device_id:
        complete_idempotency_record(device_id, idempotency_key, resp_headers, resp_body, is_binary=is_binary)

    logger.info(
        f"Utterance translated successfully in {total_ms:.1f}ms",
        extra={
            "job_id": job_id,
            "device_id": device_id or "system",
            "conversation_id": conversation_id,
            "source": norm_detected,
            "target": target_lang,
            "total_ms": total_ms,
        },
    )

    return {
        "statusCode": 200,
        "headers": resp_headers,
        "body": resp_body,
        "isBase64Encoded": is_binary,
    }
