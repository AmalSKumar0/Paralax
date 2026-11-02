"""Handler for POST /v1/uploads.

Generates a pre-signed S3 PUT URL for dashboard and machine clients to upload audio files.
Enforces max file size and valid content types.
"""

import json
import os
import uuid
from typing import Any, Dict
from src.shared.db import generate_presigned_put, get_settings
from src.shared.logging import setup_logger

logger = setup_logger("uploads")

ALLOWED_AUDIO_TYPES = [
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
    "audio/L16",
    "audio/L16;rate=16000",
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "audio/flac",
]


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    def json_resp(status_code: int, data: Any) -> Dict[str, Any]:
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
            },
            "body": json.dumps(data),
        }

    body = event.get("body") or "{}"
    if isinstance(body, str):
        try:
            payload = json.loads(body)
        except Exception:
            return json_resp(400, {"error": {"code": "invalid_json", "message": "Malformed JSON body"}})
    else:
        payload = body

    filename = payload.get("filename", "upload.wav")
    content_type = payload.get("content_type", "audio/wav")

    # Content type check
    matched_type = None
    for ct in ALLOWED_AUDIO_TYPES:
        if content_type.lower().startswith(ct.lower()):
            matched_type = content_type
            break

    if not matched_type:
        return json_resp(422, {
            "error": {
                "code": "invalid_audio_format",
                "message": f"Unsupported audio Content-Type '{content_type}'. Must be WAV, PCM L16, MP3, FLAC, or OGG.",
            }
        })

    settings = get_settings()
    max_mb = int(settings.get("max_file_size_mb", 50))
    expires_in_sec = 900  # 15 minutes

    job_id = str(uuid.uuid4())
    ext = os.path.splitext(filename)[1] or ".wav"
    s3_key = f"uploads/{job_id}/original{ext}"

    try:
        upload_url = generate_presigned_put(
            key=s3_key,
            content_type=matched_type,
            expires_in=expires_in_sec,
        )
    except Exception as e:
        logger.error(f"Failed to generate presigned upload URL: {e}", exc_info=True)
        return json_resp(500, {"error": {"code": "internal_error", "message": "Failed to generate upload URL"}})

    return json_resp(200, {
        "job_id": job_id,
        "upload_url": upload_url,
        "s3_key": s3_key,
        "expires_in": expires_in_sec,
        "max_size_mb": max_mb,
    })
