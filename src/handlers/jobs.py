"""Handler for Jobs API (Path B and Admin management).

Endpoints:
- POST   /v1/jobs
- GET    /v1/jobs/{job_id}
- GET    /v1/languages
- GET    /v1/admin/jobs
- POST   /v1/admin/jobs/{id}/retry
- POST   /v1/admin/jobs/{id}/cancel
- DELETE /v1/admin/jobs/{id}
"""

import json
import os
import uuid
from typing import Any, Dict
import boto3
from botocore.exceptions import ClientError

from src.shared.db import (
    create_job,
    delete_audio,
    delete_job_record,
    generate_presigned_get,
    get_job,
    get_settings,
    list_jobs,
    update_job,
)
from src.shared.languages import (
    get_language_info,
    list_languages,
    normalize_locale,
    validate_pair,
)
from src.shared.logging import log_event, setup_logger

logger = setup_logger("jobs")

_SFN_CLIENT = None


def get_sfn():
    global _SFN_CLIENT
    if _SFN_CLIENT is None:
        _SFN_CLIENT = boto3.client("stepfunctions", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _SFN_CLIENT


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("path") or event.get("rawPath") or ""
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}
    job_id = path_params.get("id") or path_params.get("job_id")

    def json_resp(status_code: int, data: Any) -> Dict[str, Any]:
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
            },
            "body": json.dumps(data),
        }

    def parse_body():
        b = event.get("body") or "{}"
        if isinstance(b, str):
            try:
                return json.loads(b)
            except Exception:
                return {}
        return b

    # Route: GET /v1/languages
    if http_method == "GET" and path.rstrip("/").endswith("/languages"):
        registry = list_languages()
        enriched = {}
        for locale, info in registry.items():
            valid_targets = []
            for target_locale in registry:
                ok, _ = validate_pair(locale, target_locale, is_path_a=False)
                if ok:
                    valid_targets.append(target_locale)
            item = info.copy()
            item["valid_targets"] = valid_targets
            enriched[locale] = item
        return json_resp(200, {"languages": enriched})

    # Route: POST /v1/jobs (Submit Path B file job)
    if http_method == "POST" and path.rstrip("/").endswith("/jobs"):
        body = parse_body()
        req_job_id = body.get("job_id") or str(uuid.uuid4())
        source_lang = body.get("source_language", "auto")
        target_lang = body.get("target_language")
        voice_id = body.get("voice_id")
        s3_key = body.get("s3_key") or f"uploads/{req_job_id}/original.wav"

        # Validate language pair for Path B (batch)
        is_auto = (source_lang == "auto")
        valid, reason = validate_pair(source_lang, target_lang, is_path_a=False, is_auto=is_auto)
        if not valid:
            return json_resp(422, {"error": {"code": "unsupported_language_pair", "message": reason}})

        settings = get_settings()
        create_job(
            job_id=req_job_id,
            kind="file",
            device_id=None,
            conversation_id=f"batch_{req_job_id[:8]}",
            status="QUEUED",
            source_language=source_lang,
            target_language=normalize_locale(target_lang),
            voice_id=voice_id,
            audio_input_s3_key=s3_key,
            retention_days=int(settings.get("retention_days", 30)),
        )

        # Trigger Step Functions State Machine Execution
        sfn_arn = os.environ.get("STATE_MACHINE_ARN")
        if sfn_arn:
            sfn = get_sfn()
            execution_input = {
                "job_id": req_job_id,
                "s3_key": s3_key,
                "source_language": source_lang,
                "target_language": normalize_locale(target_lang),
                "voice_id": voice_id,
            }
            try:
                sfn_resp = sfn.start_execution(
                    stateMachineArn=sfn_arn,
                    name=f"exec-{req_job_id}",
                    input=json.dumps(execution_input),
                )
                update_job(req_job_id, {"execution_arn": sfn_resp.get("executionArn")})
            except ClientError as e:
                logger.error(f"Failed to start Step Functions execution: {e}")

        log_event(logger, logger.level, f"Path B job {req_job_id} queued", job_id=req_job_id)
        return json_resp(202, {"job_id": req_job_id, "status": "QUEUED"})

    # Route: GET /v1/jobs/{job_id}
    if http_method == "GET" and path.startswith("/v1/jobs/") and job_id:
        job = get_job(job_id)
        if not job:
            return json_resp(404, {"error": {"code": "not_found", "message": "Job not found"}})

        job_resp = job.copy()
        if job.get("audio_input_s3_key"):
            job_resp["audio_input_url"] = generate_presigned_get(job["audio_input_s3_key"])
        if job.get("audio_output_s3_key"):
            job_resp["audio_output_url"] = generate_presigned_get(job["audio_output_s3_key"])

        return json_resp(200, job_resp)

    # Route: GET /v1/admin/jobs
    if http_method == "GET" and path.rstrip("/").endswith("/admin/jobs"):
        status_filter = query_params.get("status")
        kind_filter = query_params.get("kind")
        dev_filter = query_params.get("device_id")
        conv_filter = query_params.get("conversation_id")
        lang_filter = query_params.get("language")
        from_dt = query_params.get("from")
        to_dt = query_params.get("to")
        cursor = query_params.get("cursor")
        limit = int(query_params.get("limit", 50))

        items, next_cursor = list_jobs(
            status=status_filter,
            kind=kind_filter,
            device_id=dev_filter,
            conversation_id=conv_filter,
            language=lang_filter,
            from_date=from_dt,
            to_date=to_dt,
            limit=limit,
            cursor=cursor,
        )
        return json_resp(200, {"jobs": items, "next_cursor": next_cursor})

    # Route: POST /v1/admin/jobs/{id}/retry
    if http_method == "POST" and "/retry" in path and job_id:
        job = get_job(job_id)
        if not job:
            return json_resp(404, {"error": {"code": "not_found", "message": "Job not found"}})

        update_job(job_id, {"status": "QUEUED", "error": None})
        sfn_arn = os.environ.get("STATE_MACHINE_ARN")
        if sfn_arn:
            sfn = get_sfn()
            execution_input = {
                "job_id": job_id,
                "s3_key": job.get("audio_input_s3_key"),
                "source_language": job.get("source_language"),
                "target_language": job.get("target_language"),
                "voice_id": job.get("voice_id"),
            }
            try:
                sfn_resp = sfn.start_execution(
                    stateMachineArn=sfn_arn,
                    name=f"retry-{job_id}-{int(uuid.uuid4().hex[:6], 16)}",
                    input=json.dumps(execution_input),
                )
                update_job(job_id, {"execution_arn": sfn_resp.get("executionArn")})
            except ClientError as e:
                logger.error(f"Failed to retry Step Functions execution: {e}")

        return json_resp(200, {"job_id": job_id, "status": "QUEUED", "message": "Job retry scheduled"})

    # Route: POST /v1/admin/jobs/{id}/cancel
    if http_method == "POST" and "/cancel" in path and job_id:
        job = get_job(job_id)
        if not job:
            return json_resp(404, {"error": {"code": "not_found", "message": "Job not found"}})

        if job.get("status") == "COMPLETED":
            return json_resp(409, {"error": {"code": "already_completed", "message": "Cannot cancel job that has already completed."}})

        # Stop Step Functions execution
        exec_arn = job.get("execution_arn")
        if exec_arn:
            sfn = get_sfn()
            try:
                sfn.stop_execution(executionArn=exec_arn, error="CancelledByAdmin", cause="User requested cancellation")
            except Exception:
                pass

        update_job(job_id, {"status": "CANCELLED"})
        return json_resp(200, {"job_id": job_id, "status": "CANCELLED"})

    # Route: DELETE /v1/admin/jobs/{id}
    if http_method == "DELETE" and job_id:
        job = get_job(job_id)
        if not job:
            return json_resp(404, {"error": {"code": "not_found", "message": "Job not found"}})

        if job.get("audio_input_s3_key"):
            delete_audio(job["audio_input_s3_key"])
        if job.get("audio_output_s3_key"):
            delete_audio(job["audio_output_s3_key"])

        delete_job_record(job_id)
        return json_resp(200, {"status": "deleted", "job_id": job_id})

    return json_resp(404, {"error": {"code": "not_found", "message": "Route not found"}})
