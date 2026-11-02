"""Path B Task 3: Speech Synthesis Lambda.

Synthesizes translated text into spoken audio via Amazon Polly, storing the audio stream
to a deterministic S3 key (`jobs/{job_id}/synthesized.mp3`).
"""

import json
import os
import time
from typing import Any, Dict
import boto3

from src.shared.db import save_audio, update_job, AUDIO_BUCKET_NAME
from src.shared.languages import resolve_polly_voice
from src.shared.logging import setup_logger

logger = setup_logger("path_b_synthesize")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    job_id = event["job_id"]
    translation = event.get("translation", "")
    target_lang = event.get("target_language", "es-ES")
    preferred_voice = event.get("voice_id")

    update_job(job_id, {"status": "SYNTHESIZING"})
    t0 = time.perf_counter()

    voice_id, engine = resolve_polly_voice(
        target_lang,
        preferred_voice_id=preferred_voice,
        engine_preference="neural",
    )

    region = os.environ.get("AWS_REGION", "us-east-1")
    polly_client = boto3.client("polly", region_name=region)

    synth_resp = polly_client.synthesize_speech(
        Text=translation,
        OutputFormat="mp3",
        VoiceId=voice_id,
        Engine=engine,
    )
    audio_bytes = synth_resp["AudioStream"].read()

    # Deterministic output S3 key
    output_s3_key = f"jobs/{job_id}/synthesized.mp3"
    save_audio(output_s3_key, audio_bytes, content_type="audio/mpeg")

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

    event["output_s3_key"] = output_s3_key
    event["synthesize_ms"] = elapsed_ms
    event["voice_used"] = voice_id
    event["audio_output_bytes"] = len(audio_bytes)
    return event
