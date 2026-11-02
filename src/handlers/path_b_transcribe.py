"""Path B Task 1: Batch Transcription Lambda.

Uses deterministic job name derived from job_id (`paralax-{job_id}`) so Step Functions retries
never create duplicate transcription jobs.
"""

import json
import os
import time
from typing import Any, Dict
import boto3
from botocore.exceptions import ClientError

from src.shared.db import get_s3, update_job, AUDIO_BUCKET_NAME
from src.shared.languages import get_transcribe_locale, normalize_locale
from src.shared.logging import setup_logger

logger = setup_logger("path_b_transcribe")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    job_id = event["job_id"]
    s3_key = event.get("s3_key", f"uploads/{job_id}/original.wav")
    source_lang = event.get("source_language", "en-US")
    target_lang = event.get("target_language", "es-ES")
    voice_id = event.get("voice_id")

    update_job(job_id, {"status": "TRANSCRIBING"})
    t0 = time.perf_counter()

    # Deterministic job name
    transcribe_job_name = f"paralax-{job_id}"
    region = os.environ.get("AWS_REGION", "us-east-1")
    transcribe = boto3.client("transcribe", region_name=region)

    media_uri = f"s3://{AUDIO_BUCKET_NAME}/{s3_key}"

    # Check if mock hook is provided for test suites
    mock_hook = os.environ.get("MOCK_TRANSCRIBE_BATCH_HOOK")
    if mock_hook:
        mock_data = json.loads(mock_hook)
        transcript_text = mock_data.get("transcript", "This is a batch translated test file.")
        detected_lang = mock_data.get("detected_language", source_lang if source_lang != "auto" else "en-US")
    else:
        # Check if job already exists from previous retry
        try:
            job_info = transcribe.get_transcription_job(TranscriptionJobName=transcribe_job_name)
            job_status = job_info["TranscriptionJob"]["TranscriptionJobStatus"]
        except ClientError as e:
            if e.response["Error"]["Code"] == "NotFoundException":
                job_status = None
            else:
                raise

        if not job_status:
            start_kwargs = {
                "TranscriptionJobName": transcribe_job_name,
                "Media": {"MediaFileUri": media_uri},
                "OutputBucketName": AUDIO_BUCKET_NAME,
                "OutputKey": f"transcripts/{job_id}.json",
            }
            if source_lang == "auto":
                start_kwargs["IdentifyLanguage"] = True
            else:
                start_kwargs["LanguageCode"] = get_transcribe_locale(source_lang)

            transcribe.start_transcription_job(**start_kwargs)

        # Poll for completion (or timeout)
        while True:
            resp = transcribe.get_transcription_job(TranscriptionJobName=transcribe_job_name)
            current_status = resp["TranscriptionJob"]["TranscriptionJobStatus"]
            if current_status == "COMPLETED":
                detected_lang = resp["TranscriptionJob"].get("LanguageCode", source_lang)
                # Fetch transcript text from S3
                s3 = get_s3()
                transcript_obj = s3.get_object(Bucket=AUDIO_BUCKET_NAME, Key=f"transcripts/{job_id}.json")
                transcript_json = json.loads(transcript_obj["Body"].read().decode("utf-8"))
                transcript_text = transcript_json.get("results", {}).get("transcripts", [{}])[0].get("transcript", "")
                break
            elif current_status == "FAILED":
                failure_reason = resp["TranscriptionJob"].get("FailureReason", "Transcribe batch job failed.")
                raise RuntimeError(f"Transcribe batch failure: {failure_reason}")

            time.sleep(2)

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "job_id": job_id,
        "s3_key": s3_key,
        "source_language": source_lang,
        "detected_language": detected_lang,
        "target_language": target_lang,
        "voice_id": voice_id,
        "transcript": transcript_text,
        "transcribe_ms": elapsed_ms,
    }
