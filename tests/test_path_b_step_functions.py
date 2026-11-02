"""Unit and integration tests for Path B File Jobs and Step Functions Pipeline."""

import io
import json
import os
import pytest
from moto import mock_aws
import boto3
from botocore.stub import Stubber

from src.shared.db import (
    create_job,
    get_job,
    save_audio,
)
from src.handlers.uploads import handler as uploads_handler
from src.handlers.jobs import handler as jobs_handler
from src.handlers.path_b_transcribe import handler as transcribe_task
from src.handlers.path_b_translate import handler as translate_task
from src.handlers.path_b_synthesize import handler as synthesize_task
from src.handlers.path_b_finalize import handler as finalize_task


@pytest.fixture
def setup_path_b_env(monkeypatch):
    with mock_aws():
        region = "us-east-1"
        monkeypatch.setenv("AWS_REGION", region)
        monkeypatch.setenv("JOBS_TABLE_NAME", "ParalaxJobs")
        monkeypatch.setenv("SETTINGS_TABLE_NAME", "ParalaxSettings")
        monkeypatch.setenv("AUDIO_BUCKET_NAME", "paralax-audio-storage")
        monkeypatch.setenv("STATE_MACHINE_ARN", "arn:aws:states:us-east-1:123456789012:stateMachine:ParalaxFileJobPipeline")

        dynamodb = boto3.resource("dynamodb", region_name=region)
        s3 = boto3.client("s3", region_name=region)
        sfn = boto3.client("stepfunctions", region_name=region)

        s3.create_bucket(Bucket="paralax-audio-storage")

        dynamodb.create_table(
            TableName="ParalaxJobs",
            KeySchema=[{"AttributeName": "job_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "job_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxSettings",
            KeySchema=[{"AttributeName": "setting_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "setting_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # Create dummy Step Functions state machine
        sfn_resp = sfn.create_state_machine(
            name="ParalaxFileJobPipeline",
            definition=json.dumps({"StartAt": "Pass", "States": {"Pass": {"Type": "Pass", "End": True}}}),
            roleArn="arn:aws:iam::123456789012:role/DummyRole",
        )
        monkeypatch.setenv("STATE_MACHINE_ARN", sfn_resp["stateMachineArn"])

        yield


def test_uploads_presigned_url(setup_path_b_env):
    """Verify POST /v1/uploads generates presigned upload URL."""
    event = {
        "httpMethod": "POST",
        "body": json.dumps({"filename": "interview.wav", "content_type": "audio/wav"}),
    }
    resp = uploads_handler(event, None)
    assert resp["statusCode"] == 200
    data = json.loads(resp["body"])
    assert "job_id" in data
    assert "upload_url" in data
    assert data["s3_key"].startswith("uploads/")

    # Unsupported format rejection
    event_bad = {
        "httpMethod": "POST",
        "body": json.dumps({"filename": "doc.pdf", "content_type": "application/pdf"}),
    }
    resp_bad = uploads_handler(event_bad, None)
    assert resp_bad["statusCode"] == 422
    assert "invalid_audio_format" in resp_bad["body"]


def test_jobs_submission_and_query(setup_path_b_env):
    """Verify POST /v1/jobs submits job, triggers SFN, and GET /v1/jobs/{id} returns details."""
    event_submit = {
        "httpMethod": "POST",
        "path": "/v1/jobs",
        "body": json.dumps({
            "job_id": "test-file-job-001",
            "source_language": "en-US",
            "target_language": "es-ES",
        }),
    }
    resp_sub = jobs_handler(event_submit, None)
    assert resp_sub["statusCode"] == 202
    data_sub = json.loads(resp_sub["body"])
    assert data_sub["job_id"] == "test-file-job-001"
    assert data_sub["status"] == "QUEUED"

    # Verify query
    event_get = {
        "httpMethod": "GET",
        "path": "/v1/jobs/test-file-job-001",
        "pathParameters": {"job_id": "test-file-job-001"},
    }
    resp_get = jobs_handler(event_get, None)
    assert resp_get["statusCode"] == 200
    job_detail = json.loads(resp_get["body"])
    assert job_detail["kind"] == "file"
    assert job_detail["source_language"] == "en-US"
    assert job_detail["target_language"] == "es-ES"


def test_jobs_unsupported_language_pair(setup_path_b_env):
    """Verify POST /v1/jobs rejects unsupported language pairs."""
    event = {
        "httpMethod": "POST",
        "path": "/v1/jobs",
        "body": json.dumps({
            "source_language": "en-US",
            "target_language": "unknown-LANG",
        }),
    }
    resp = jobs_handler(event, None)
    assert resp["statusCode"] == 422
    data = json.loads(resp["body"])
    assert data["error"]["code"] == "unsupported_language_pair"


def test_jobs_cancellation_and_conflict(setup_path_b_env):
    """Verify POST /v1/admin/jobs/{id}/cancel cancels running job but rejects 409 if already COMPLETED."""
    create_job(
        job_id="job-running",
        kind="file",
        device_id=None,
        conversation_id="c1",
        status="TRANSLATING",
        source_language="en-US",
        target_language="fr-FR",
    )
    event_cancel = {
        "httpMethod": "POST",
        "path": "/v1/admin/jobs/job-running/cancel",
        "pathParameters": {"id": "job-running"},
    }
    resp_cancel = jobs_handler(event_cancel, None)
    assert resp_cancel["statusCode"] == 200
    assert json.loads(resp_cancel["body"])["status"] == "CANCELLED"

    # Already completed job
    create_job(
        job_id="job-done",
        kind="file",
        device_id=None,
        conversation_id="c2",
        status="COMPLETED",
        source_language="en-US",
        target_language="fr-FR",
    )
    event_cancel_done = {
        "httpMethod": "POST",
        "path": "/v1/admin/jobs/job-done/cancel",
        "pathParameters": {"id": "job-done"},
    }
    resp_done = jobs_handler(event_cancel_done, None)
    assert resp_done["statusCode"] == 409
    assert json.loads(resp_done["body"])["error"]["code"] == "already_completed"


def test_path_b_step_functions_task_chain(setup_path_b_env, monkeypatch):
    """Verify execution through Path B tasks: Transcribe -> Translate -> Synthesize -> Finalize."""
    job_id = "job-sfn-pipeline-01"
    create_job(
        job_id=job_id,
        kind="file",
        device_id=None,
        conversation_id="conv-sfn",
        status="QUEUED",
        source_language="en-US",
        target_language="es-ES",
    )

    # 1. Transcribe Task
    monkeypatch.setenv(
        "MOCK_TRANSCRIBE_BATCH_HOOK",
        json.dumps({
            "transcript": "Serverless architectures enable rapid innovation.",
            "detected_language": "en-US",
        }),
    )
    transcribe_in = {
        "job_id": job_id,
        "s3_key": f"uploads/{job_id}/original.wav",
        "source_language": "en-US",
        "target_language": "es-ES",
    }
    transcribe_out = transcribe_task(transcribe_in, None)
    assert transcribe_out["transcript"] == "Serverless architectures enable rapid innovation."
    assert transcribe_out["transcribe_ms"] >= 0

    # 2. Translate Task (Stubbed)
    translate_client = boto3.client("translate", region_name="us-east-1")
    polly_client = boto3.client("polly", region_name="us-east-1")

    stub_translate = Stubber(translate_client)
    stub_translate.add_response(
        "translate_text",
        {
            "TranslatedText": "Las arquitecturas sin servidor permiten una innovación rápida.",
            "SourceLanguageCode": "en",
            "TargetLanguageCode": "es",
        },
    )

    # 3. Synthesize Task (Stubbed)
    stub_polly = Stubber(polly_client)
    stub_polly.add_response(
        "synthesize_speech",
        {
            "AudioStream": io.BytesIO(b"\x00\x01\x02\x03" * 1000),
            "ContentType": "audio/mpeg",
        },
    )

    orig_client = boto3.client
    monkeypatch.setattr(
        boto3,
        "client",
        lambda service, **kwargs: translate_client if service == "translate" else (polly_client if service == "polly" else orig_client(service, **kwargs))
    )

    with stub_translate, stub_polly:
        translate_out = translate_task(transcribe_out, None)
        assert translate_out["translation"] == "Las arquitecturas sin servidor permiten una innovación rápida."
        assert "translate_ms" in translate_out

        synth_out = synthesize_task(translate_out, None)
        assert synth_out["output_s3_key"] == f"jobs/{job_id}/synthesized.mp3"
        assert "synthesize_ms" in synth_out

    # 4. Finalize Task (Success)
    final_out = finalize_task(synth_out, None)
    assert final_out["status"] == "COMPLETED"

    completed_job = get_job(job_id)
    assert completed_job["status"] == "COMPLETED"
    assert completed_job["transcript"] == "Serverless architectures enable rapid innovation."
    assert completed_job["translation"] == "Las arquitecturas sin servidor permiten una innovación rápida."
    assert completed_job["audio_output_s3_key"] == f"jobs/{job_id}/synthesized.mp3"
    assert completed_job["timings"]["total_ms"] > 0


def test_path_b_step_functions_error_catch(setup_path_b_env):
    """Verify Finalizer Lambda gracefully handles error catch block and updates job to FAILED."""
    job_id = "job-sfn-failed"
    create_job(
        job_id=job_id,
        kind="file",
        device_id=None,
        conversation_id="conv-fail",
        status="TRANSCRIBING",
        source_language="en-US",
        target_language="es-ES",
    )

    error_event = {
        "job_id": job_id,
        "Error": "TranscribeTimeoutException",
        "Cause": json.dumps({"job_id": job_id, "errorMessage": "Transcription timed out after 300 seconds"}),
    }

    final_resp = finalize_task(error_event, None)
    assert final_resp["status"] == "FAILED"

    failed_job = get_job(job_id)
    assert failed_job["status"] == "FAILED"
    assert failed_job["error"]["code"] == "batch_workflow_failed"
    assert "timed out" in failed_job["error"]["message"]
