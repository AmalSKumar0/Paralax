"""Full-flow end-to-end integration tests for Path A and Path B."""

import base64
import io
import json
import os
import pytest
from moto import mock_aws
import boto3
from botocore.stub import Stubber

from src.shared.audio import create_sine_pcm
from src.shared.db import (
    create_device,
    hash_key,
    get_job,
    save_audio,
)
from src.handlers.admin_devices import handler as admin_devices
from src.handlers.device_heartbeat import handler as device_heartbeat
from src.handlers.device_config import handler as device_config
from src.handlers.translate_utterance import handler as device_translate
from src.handlers.admin_conversations import handler as admin_conversations
from src.handlers.uploads import handler as uploads_handler
from src.handlers.jobs import handler as jobs_handler
from src.handlers.path_b_transcribe import handler as sfn_transcribe
from src.handlers.path_b_translate import handler as sfn_translate
from src.handlers.path_b_synthesize import handler as sfn_synthesize
from src.handlers.path_b_finalize import handler as sfn_finalize
from src.handlers.admin_stats import handler as admin_stats


@pytest.fixture
def full_env(monkeypatch):
    with mock_aws():
        region = "us-east-1"
        monkeypatch.setenv("AWS_REGION", region)
        monkeypatch.setenv("JOBS_TABLE_NAME", "ParalaxJobs")
        monkeypatch.setenv("DEVICES_TABLE_NAME", "ParalaxDevices")
        monkeypatch.setenv("COMMANDS_TABLE_NAME", "ParalaxDeviceCommands")
        monkeypatch.setenv("TELEMETRY_TABLE_NAME", "ParalaxTelemetry")
        monkeypatch.setenv("SETTINGS_TABLE_NAME", "ParalaxSettings")
        monkeypatch.setenv("RATE_LIMITS_TABLE_NAME", "ParalaxRateLimits")
        monkeypatch.setenv("IDEMPOTENCY_TABLE_NAME", "ParalaxIdempotency")
        monkeypatch.setenv("API_KEYS_TABLE_NAME", "ParalaxApiKeys")
        monkeypatch.setenv("AUDIO_BUCKET_NAME", "paralax-audio-storage")

        dynamodb = boto3.resource("dynamodb", region_name=region)
        s3 = boto3.client("s3", region_name=region)

        s3.create_bucket(Bucket="paralax-audio-storage")

        for table_name in ["ParalaxJobs", "ParalaxDevices", "ParalaxSettings", "ParalaxRateLimits", "ParalaxIdempotency", "ParalaxApiKeys"]:
            dynamodb.create_table(
                TableName=table_name,
                KeySchema=[{"AttributeName": "job_id" if "Jobs" in table_name else ("device_id" if "Devices" in table_name else ("setting_id" if "Settings" in table_name else ("pk" if "Rate" in table_name else ("idempotency_key" if "Idem" in table_name else "api_key_hash")))), "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": "job_id" if "Jobs" in table_name else ("device_id" if "Devices" in table_name else ("setting_id" if "Settings" in table_name else ("pk" if "Rate" in table_name else ("idempotency_key" if "Idem" in table_name else "api_key_hash")))), "AttributeType": "S"}],
                BillingMode="PAY_PER_REQUEST",
            )

        dynamodb.create_table(
            TableName="ParalaxDeviceCommands",
            KeySchema=[{"AttributeName": "device_id", "KeyType": "HASH"}, {"AttributeName": "command_id", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "device_id", "AttributeType": "S"}, {"AttributeName": "command_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxTelemetry",
            KeySchema=[{"AttributeName": "device_id", "KeyType": "HASH"}, {"AttributeName": "timestamp", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "device_id", "AttributeType": "S"}, {"AttributeName": "timestamp", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        monkeypatch.setenv("AI_PROVIDER", "aws")

        yield

        import src.handlers.translate_utterance as tr_mod
        tr_mod._TRANSLATE_CLIENT = None
        tr_mod._POLLY_CLIENT = None


def test_path_a_full_e2e_flow(full_env, monkeypatch):
    """Path A End-to-End: Provision -> Heartbeat -> Config -> Push-To-Talk -> Single Round-Trip Audio -> Admin Conversation."""
    # 1. Admin provisions device
    prov_resp = admin_devices({"httpMethod": "POST", "body": json.dumps({"device_id": "esp32-flow-01"})}, None)
    assert prov_resp["statusCode"] == 201
    prov_data = json.loads(prov_resp["body"])
    device_id = prov_data["device_id"]
    device_key = prov_data["device_key"]

    auth_ctx = {
        "device_id": device_id,
        "config_version": "1",
        "mode": "auto",
        "language_a": "en-US",
        "language_b": "es-US",
    }

    # 2. Device sends initial heartbeat
    hb_resp = device_heartbeat({
        "body": json.dumps({"firmware_version": "1.0.0", "rssi": -55, "free_heap": 180000, "uptime_sec": 100, "config_version": 1}),
        "requestContext": {"authorizer": {"lambda": auth_ctx}},
    }, None)
    assert hb_resp["statusCode"] == 200
    assert json.loads(hb_resp["body"])["config_changed"] is False

    # 3. Device fetches config
    cfg_resp = device_config({"requestContext": {"authorizer": {"lambda": auth_ctx}}}, None)
    assert cfg_resp["statusCode"] == 200
    assert json.loads(cfg_resp["body"])["language_a"] == "en-US"

    # 4. Device sends push-to-talk audio utterance (Single round trip with Accept: application/octet-stream)
    monkeypatch.setenv(
        "MOCK_TRANSCRIBE_STREAMING_HOOK",
        json.dumps({
            "transcript": "Where is the nearest subway station?",
            "detected_language": "en-US",
            "confidence": 0.99,
        }),
    )

    translate_client = boto3.client("translate", region_name="us-east-1")
    polly_client = boto3.client("polly", region_name="us-east-1")

    translate_stub = Stubber(translate_client)
    polly_stub = Stubber(polly_client)

    translate_stub.add_response(
        "translate_text",
        {"TranslatedText": "¿Dónde está la estación de metro más cercana?", "SourceLanguageCode": "en", "TargetLanguageCode": "es"},
    )
    synth_pcm = create_sine_pcm(frequency_hz=400, duration_sec=1.2)
    polly_stub.add_response(
        "synthesize_speech",
        {"AudioStream": io.BytesIO(synth_pcm), "ContentType": "audio/L16;rate=16000"},
    )

    import src.handlers.translate_utterance as tr_mod
    tr_mod._TRANSLATE_CLIENT = translate_client
    tr_mod._POLLY_CLIENT = polly_client

    with translate_stub, polly_stub:
        input_pcm = create_sine_pcm(frequency_hz=440, duration_sec=1.5)
        trans_event = {
            "headers": {
                "Content-Type": "audio/L16;rate=16000",
                "Accept": "application/octet-stream",
                "Idempotency-Key": "flow-key-001",
                "x-conversation-id": "conv-flow-01",
            },
            "body": base64.b64encode(input_pcm).decode("ascii"),
            "isBase64Encoded": True,
            "requestContext": {"authorizer": {"lambda": auth_ctx}},
        }
        trans_resp = device_translate(trans_event, None)

        assert trans_resp["statusCode"] == 200
        assert trans_resp["isBase64Encoded"] is True
        headers = trans_resp["headers"]
        assert headers["Content-Type"] == "audio/L16;rate=16000"
        assert "X-Job-Id" in headers
        assert headers["X-Detected-Language"] == "en-US"
        assert headers["X-Target-Language"] == "es-US"

        # Decoded audio matches synthesized stream
        assert base64.b64decode(trans_resp["body"]) == synth_pcm

    # 5. Admin retrieves conversation history
    conv_resp = admin_conversations({
        "httpMethod": "GET",
        "path": "/v1/admin/conversations/conv-flow-01",
        "pathParameters": {"id": "conv-flow-01"},
    }, None)
    assert conv_resp["statusCode"] == 200
    conv_data = json.loads(conv_resp["body"])
    assert conv_data["total_utterances"] == 1
    assert conv_data["utterances"][0]["transcript"] == "Where is the nearest subway station?"


def test_path_b_full_e2e_flow(full_env, monkeypatch):
    """Path B End-to-End: Presigned Upload -> Job Submit -> Step Functions Pipeline -> Result Retrieval -> Admin Stats."""
    # 1. Presigned upload
    up_resp = uploads_handler({"httpMethod": "POST", "body": json.dumps({"filename": "podcast.wav", "content_type": "audio/wav"})}, None)
    assert up_resp["statusCode"] == 200
    up_data = json.loads(up_resp["body"])
    job_id = up_data["job_id"]
    s3_key = up_data["s3_key"]

    # 2. Submit batch job
    sub_resp = jobs_handler({
        "httpMethod": "POST",
        "path": "/v1/jobs",
        "body": json.dumps({"job_id": job_id, "s3_key": s3_key, "source_language": "en-US", "target_language": "fr-FR"}),
    }, None)
    assert sub_resp["statusCode"] == 202
    assert json.loads(sub_resp["body"])["status"] == "QUEUED"

    # 3. Step Functions Execution (Tasks 1 through 4)
    monkeypatch.setenv(
        "MOCK_TRANSCRIBE_BATCH_HOOK",
        json.dumps({"transcript": "Welcome to the future of voice technology.", "detected_language": "en-US"}),
    )
    t1_out = sfn_transcribe({"job_id": job_id, "s3_key": s3_key, "source_language": "en-US", "target_language": "fr-FR"}, None)
    assert t1_out["transcript"] == "Welcome to the future of voice technology."

    translate_client = boto3.client("translate", region_name="us-east-1")
    polly_client = boto3.client("polly", region_name="us-east-1")

    stub_translate = Stubber(translate_client)
    stub_polly = Stubber(polly_client)

    stub_translate.add_response(
        "translate_text",
        {"TranslatedText": "Bienvenue dans le futur de la technologie vocale.", "SourceLanguageCode": "en", "TargetLanguageCode": "fr"},
    )
    stub_polly.add_response(
        "synthesize_speech",
        {"AudioStream": io.BytesIO(b"\x00\x01\x02\x03" * 2000), "ContentType": "audio/mpeg"},
    )

    orig_client = boto3.client
    monkeypatch.setattr(
        boto3,
        "client",
        lambda service, **kwargs: translate_client if service == "translate" else (polly_client if service == "polly" else orig_client(service, **kwargs))
    )

    with stub_translate, stub_polly:
        t2_out = sfn_translate(t1_out, None)
        assert t2_out["translation"] == "Bienvenue dans le futur de la technologie vocale."

        t3_out = sfn_synthesize(t2_out, None)
        assert t3_out["output_s3_key"] == f"jobs/{job_id}/synthesized.mp3"

        t4_out = sfn_finalize(t3_out, None)
        assert t4_out["status"] == "COMPLETED"

    # 4. Client retrieves job result
    get_resp = jobs_handler({
        "httpMethod": "GET",
        "path": f"/v1/jobs/{job_id}",
        "pathParameters": {"job_id": job_id},
    }, None)
    assert get_resp["statusCode"] == 200
    res = json.loads(get_resp["body"])
    assert res["status"] == "COMPLETED"
    assert res["transcript"] == "Welcome to the future of voice technology."
    assert res["translation"] == "Bienvenue dans le futur de la technologie vocale."
    assert res["audio_output_url"] is not None

    # 5. Admin Stats reflect completed job
    stats_resp = admin_stats({"httpMethod": "GET"}, None)
    assert stats_resp["statusCode"] == 200
    stats_data = json.loads(stats_resp["body"])
    assert stats_data["jobs"]["counts_by_status"]["COMPLETED"] >= 1
    assert stats_data["jobs"]["counts_by_kind"]["file"] >= 1
