"""Path B Task 4 & Error Handler: Finalizer Lambda.

Completes the Step Functions workflow by updating the job state in DynamoDB to
COMPLETED (with total timings and output locations) or FAILED (with readable error),
and emitting CloudWatch EMF metrics.
"""

import json
import os
from typing import Any, Dict
from src.shared.db import update_job
from src.shared.logging import log_event, setup_logger
from src.shared.metrics import emit_translation_metrics

logger = setup_logger("path_b_finalize")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    job_id = event.get("job_id")
    if not job_id:
        # Error catch block might wrap the input under Cause or Execution
        cause = event.get("Cause")
        if cause:
            try:
                cause_json = json.loads(cause)
                job_id = cause_json.get("job_id")
            except Exception:
                pass

    if not job_id:
        logger.error(f"Finalizer received event without job_id: {event}")
        return {"status": "ERROR", "message": "Missing job_id"}

    # Check if this invocation is handling an error catch
    error_info = event.get("Error") or event.get("error")
    if error_info:
        error_msg = str(event.get("Cause") or error_info)
        update_job(job_id, {
            "status": "FAILED",
            "error": {
                "code": "batch_workflow_failed",
                "message": error_msg[:500],
            },
        })
        emit_translation_metrics(
            device_id="dashboard",
            source_language=event.get("source_language", "unknown"),
            target_language=event.get("target_language", "unknown"),
            transcribe_ms=0,
            translate_ms=0,
            synthesize_ms=0,
            total_ms=0,
            is_success=False,
            kind="file",
            error_code="batch_workflow_failed",
        )
        log_event(logger, logger.level, f"Path B job {job_id} failed: {error_msg}", job_id=job_id)
        return {"job_id": job_id, "status": "FAILED"}

    # Success Flow
    transcribe_ms = float(event.get("transcribe_ms", 0.0))
    translate_ms = float(event.get("translate_ms", 0.0))
    synthesize_ms = float(event.get("synthesize_ms", 0.0))
    total_ms = round(transcribe_ms + translate_ms + synthesize_ms, 2)

    updates = {
        "status": "COMPLETED",
        "transcript": event.get("transcript", ""),
        "translation": event.get("translation", ""),
        "detected_language": event.get("detected_language"),
        "audio_output_s3_key": event.get("output_s3_key"),
        "timings": {
            "transcribe_ms": transcribe_ms,
            "translate_ms": translate_ms,
            "synthesize_ms": synthesize_ms,
            "total_ms": total_ms,
        },
    }
    update_job(job_id, updates)

    emit_translation_metrics(
        device_id="dashboard",
        source_language=event.get("detected_language") or event.get("source_language", "en-US"),
        target_language=event.get("target_language", "es-ES"),
        transcribe_ms=transcribe_ms,
        translate_ms=translate_ms,
        synthesize_ms=synthesize_ms,
        total_ms=total_ms,
        is_success=True,
        kind="file",
    )

    log_event(
        logger,
        logger.level,
        f"Path B job {job_id} completed successfully in {total_ms}ms",
        job_id=job_id,
        total_ms=total_ms,
    )

    return {"job_id": job_id, "status": "COMPLETED"}
