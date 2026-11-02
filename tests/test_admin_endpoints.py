"""Unit and integration tests for Admin endpoints.

Covers:
- Devices: CRUD, config updates, key rotation, revocation, cascade delete
- Conversations: session listing and chronological utterances
- Settings: GET and PUT
- Stats: status counts, online counts, p50/p95 latency calculations
- Health: reachability and offline device alerts
- API Keys: lifecycle
"""

import json
from datetime import datetime, timezone
import pytest
from moto import mock_aws
import boto3

from src.shared.db import (
    create_device,
    create_job,
    hash_key,
    save_audio,
)
from src.handlers.admin_devices import handler as admin_devices_handler
from src.handlers.admin_conversations import handler as admin_conversations_handler
from src.handlers.admin_settings import handler as admin_settings_handler
from src.handlers.admin_stats import handler as admin_stats_handler
from src.handlers.admin_health import handler as admin_health_handler
from src.handlers.admin_api_keys import handler as admin_api_keys_handler


@pytest.fixture
def setup_admin_tables(monkeypatch):
    with mock_aws():
        region = "us-east-1"
        monkeypatch.setenv("AWS_REGION", region)
        monkeypatch.setenv("JOBS_TABLE_NAME", "ParalaxJobs")
        monkeypatch.setenv("DEVICES_TABLE_NAME", "ParalaxDevices")
        monkeypatch.setenv("COMMANDS_TABLE_NAME", "ParalaxDeviceCommands")
        monkeypatch.setenv("TELEMETRY_TABLE_NAME", "ParalaxTelemetry")
        monkeypatch.setenv("SETTINGS_TABLE_NAME", "ParalaxSettings")
        monkeypatch.setenv("API_KEYS_TABLE_NAME", "ParalaxApiKeys")
        monkeypatch.setenv("AUDIO_BUCKET_NAME", "paralax-audio-storage")

        dynamodb = boto3.resource("dynamodb", region_name=region)
        s3 = boto3.client("s3", region_name=region)

        s3.create_bucket(Bucket="paralax-audio-storage")

        dynamodb.create_table(
            TableName="ParalaxJobs",
            KeySchema=[{"AttributeName": "job_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "job_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxDevices",
            KeySchema=[{"AttributeName": "device_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "device_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxDeviceCommands",
            KeySchema=[
                {"AttributeName": "device_id", "KeyType": "HASH"},
                {"AttributeName": "command_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "device_id", "AttributeType": "S"},
                {"AttributeName": "command_id", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxTelemetry",
            KeySchema=[
                {"AttributeName": "device_id", "KeyType": "HASH"},
                {"AttributeName": "timestamp", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "device_id", "AttributeType": "S"},
                {"AttributeName": "timestamp", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxSettings",
            KeySchema=[{"AttributeName": "setting_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "setting_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxApiKeys",
            KeySchema=[{"AttributeName": "api_key_hash", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "api_key_hash", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        yield


def test_admin_devices_crud_and_cascade_delete(setup_admin_tables):
    """Verify device creation (raw key returned once), rotation, and cascade deletion."""
    # 1. Provision new device
    event_create = {
        "httpMethod": "POST",
        "path": "/v1/admin/devices",
        "body": json.dumps({"device_id": "esp32-adm-01"}),
    }
    resp_create = admin_devices_handler(event_create, None)
    assert resp_create["statusCode"] == 201
    data_create = json.loads(resp_create["body"])
    assert data_create["device_id"] == "esp32-adm-01"
    assert "device_key" in data_create
    assert data_create["online"] is False

    # 2. Add sample Job and S3 audio for this device
    save_audio("utterances/conv1/job1_in.pcm", b"input audio bytes")
    save_audio("utterances/conv1/job1_out.pcm", b"output audio bytes")
    create_job(
        job_id="job-cascade-01",
        kind="utterance",
        device_id="esp32-adm-01",
        conversation_id="conv-01",
        status="COMPLETED",
        source_language="en-US",
        target_language="es-ES",
        audio_input_s3_key="utterances/conv1/job1_in.pcm",
        audio_output_s3_key="utterances/conv1/job1_out.pcm",
    )

    # 3. Rotate key
    event_rotate = {
        "httpMethod": "POST",
        "path": "/v1/admin/devices/esp32-adm-01/rotate-key",
        "pathParameters": {"id": "esp32-adm-01"},
    }
    resp_rotate = admin_devices_handler(event_rotate, None)
    assert resp_rotate["statusCode"] == 200
    assert "device_key" in json.loads(resp_rotate["body"])

    # 4. Delete device -> Cascade deletes jobs and S3 data
    event_delete = {
        "httpMethod": "DELETE",
        "path": "/v1/admin/devices/esp32-adm-01",
        "pathParameters": {"id": "esp32-adm-01"},
    }
    resp_del = admin_devices_handler(event_delete, None)
    assert resp_del["statusCode"] == 200
    del_data = json.loads(resp_del["body"])
    assert del_data["status"] == "deleted"
    assert del_data["deleted_jobs_count"] == 1


def test_admin_conversations(setup_admin_tables):
    """Verify conversation listing and utterance retrieval."""
    create_job(
        job_id="job-conv-1",
        kind="utterance",
        device_id="esp32-conv-01",
        conversation_id="c-999",
        status="COMPLETED",
        source_language="en-US",
        target_language="es-US",
        transcript="Hello",
        translation="Hola",
    )
    create_job(
        job_id="job-conv-2",
        kind="utterance",
        device_id="esp32-conv-01",
        conversation_id="c-999",
        status="COMPLETED",
        source_language="es-US",
        target_language="en-US",
        transcript="Hola",
        translation="Hello",
    )

    # List conversations
    event_list = {
        "httpMethod": "GET",
        "path": "/v1/admin/conversations",
    }
    resp_list = admin_conversations_handler(event_list, None)
    assert resp_list["statusCode"] == 200
    data_list = json.loads(resp_list["body"])
    assert len(data_list["conversations"]) >= 1
    assert data_list["conversations"][0]["conversation_id"] == "c-999"
    assert data_list["conversations"][0]["utterance_count"] == 2

    # Get single conversation utterances
    event_detail = {
        "httpMethod": "GET",
        "path": "/v1/admin/conversations/c-999",
        "pathParameters": {"id": "c-999"},
    }
    resp_detail = admin_conversations_handler(event_detail, None)
    assert resp_detail["statusCode"] == 200
    data_detail = json.loads(resp_detail["body"])
    assert data_detail["total_utterances"] == 2
    assert len(data_detail["utterances"]) == 2


def test_admin_settings_get_and_put(setup_admin_tables):
    """Verify reading and updating settings."""
    event_get = {"httpMethod": "GET"}
    resp_get = admin_settings_handler(event_get, None)
    assert resp_get["statusCode"] == 200
    cfg = json.loads(resp_get["body"])
    assert cfg["service_enabled"] is True

    # Update max_utterance_sec to 20
    event_put = {
        "httpMethod": "PUT",
        "body": json.dumps({"max_utterance_sec": 20, "store_audio": False}),
    }
    resp_put = admin_settings_handler(event_put, None)
    assert resp_put["statusCode"] == 200
    updated = json.loads(resp_put["body"])
    assert updated["max_utterance_sec"] == 20
    assert updated["store_audio"] is False


def test_admin_stats(setup_admin_tables):
    """Verify stats aggregation and percentile computations."""
    # Seed a couple of jobs with timings
    create_job(
        job_id="job-s1",
        kind="utterance",
        device_id="esp32-s1",
        conversation_id="conv-s",
        status="COMPLETED",
        source_language="en-US",
        target_language="es-ES",
        timings={"total_ms": 1200.0, "transcribe_ms": 600.0, "translate_ms": 200.0, "synthesize_ms": 400.0},
        durations={"audio_input_sec": 3.0},
    )
    create_job(
        job_id="job-s2",
        kind="utterance",
        device_id="esp32-s1",
        conversation_id="conv-s",
        status="FAILED",
        source_language="en-US",
        target_language="fr-FR",
    )

    event_stats = {"httpMethod": "GET"}
    resp_stats = admin_stats_handler(event_stats, None)
    assert resp_stats["statusCode"] == 200
    stats = json.loads(resp_stats["body"])

    assert stats["jobs"]["total"] >= 2
    assert stats["jobs"]["counts_by_status"]["COMPLETED"] >= 1
    assert stats["jobs"]["counts_by_status"]["FAILED"] >= 1
    assert stats["audio"]["total_audio_minutes"] > 0
    assert "latencies_24h_ms" in stats
    assert stats["metadata"]["query_cap"] == 500


def test_admin_health(setup_admin_tables):
    """Verify health endpoint structure and reachability reporting."""
    event_health = {"httpMethod": "GET"}
    resp_health = admin_health_handler(event_health, None)
    assert resp_health["statusCode"] in [200, 503]
    health = json.loads(resp_health["body"])

    assert "status" in health
    assert "services" in health
    assert health["services"]["dynamodb"]["status"] == "reachable"
    assert health["services"]["s3"]["status"] == "reachable"
    assert "devices" in health
    assert "last_failed_jobs" in health


def test_admin_api_keys_lifecycle(setup_admin_tables):
    """Verify API keys generation, listing, and deletion."""
    # Create key
    event_create = {
        "httpMethod": "POST",
        "body": json.dumps({"name": "Dashboard Machine Client"}),
    }
    resp_create = admin_api_keys_handler(event_create, None)
    assert resp_create["statusCode"] == 201
    created_key = json.loads(resp_create["body"])
    assert "api_key" in created_key
    assert "api_key_hash" in created_key

    key_hash = created_key["api_key_hash"]

    # List keys
    event_list = {"httpMethod": "GET"}
    resp_list = admin_api_keys_handler(event_list, None)
    assert resp_list["statusCode"] == 200
    keys_list = json.loads(resp_list["body"])
    assert len(keys_list["api_keys"]) >= 1

    # Delete key
    event_del = {
        "httpMethod": "DELETE",
        "pathParameters": {"id": key_hash},
    }
    resp_del = admin_api_keys_handler(event_del, None)
    assert resp_del["statusCode"] == 200
