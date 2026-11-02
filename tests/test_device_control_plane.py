"""Unit & integration tests for Device Control Plane.

Covers:
- POST /v1/device/heartbeat
- GET  /v1/device/config
- POST /v1/device/commands/{id}/ack
"""

import json
import pytest
from moto import mock_aws
import boto3

from src.shared.db import (
    create_device,
    enqueue_command,
    hash_key,
    query_telemetry,
    update_device_config,
)
from src.handlers.device_heartbeat import handler as heartbeat_handler
from src.handlers.device_config import handler as config_handler
from src.handlers.device_commands import handler as commands_handler


@pytest.fixture
def setup_control_plane_tables(monkeypatch):
    with mock_aws():
        region = "us-east-1"
        monkeypatch.setenv("AWS_REGION", region)
        monkeypatch.setenv("DEVICES_TABLE_NAME", "ParalaxDevices")
        monkeypatch.setenv("COMMANDS_TABLE_NAME", "ParalaxDeviceCommands")
        monkeypatch.setenv("TELEMETRY_TABLE_NAME", "ParalaxTelemetry")

        dynamodb = boto3.resource("dynamodb", region_name=region)
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

        raw_key = "dev_secret_key"
        key_hash = hash_key(raw_key)
        create_device("esp32-ctrl-01", key_hash)

        yield {"device_id": "esp32-ctrl-01"}


def test_heartbeat_sync_and_command_delivery(setup_control_plane_tables):
    """Verify heartbeat logs telemetry, detects config drift, and dispatches pending commands."""
    device_id = setup_control_plane_tables["device_id"]

    # 1. Enqueue command for the device
    enqueue_command(device_id, "cmd-99", "reboot", {"reason": "firmware_upgrade"})

    # 2. Update cloud config to increment version to 2
    update_device_config(device_id, {"volume_pct": 80})

    # Device still has config_version = 1
    event = {
        "body": json.dumps({
            "firmware_version": "1.0.2",
            "rssi": -65,
            "free_heap": 160000,
            "uptime_sec": 7200,
            "battery_pct": 92,
            "config_version": 1,
        }),
        "requestContext": {
            "authorizer": {
                "lambda": {"device_id": device_id}
            }
        },
    }

    resp = heartbeat_handler(event, None)
    assert resp["statusCode"] == 200
    data = json.loads(resp["body"])

    assert data["config_version"] == 2
    assert data["config_changed"] is True
    assert data["heartbeat_interval_sec"] == 30
    assert len(data["commands"]) == 1
    assert data["commands"][0]["id"] == "cmd-99"
    assert data["commands"][0]["type"] == "reboot"

    # Verify telemetry sample was recorded
    telemetry_samples = query_telemetry(device_id)
    assert len(telemetry_samples) >= 1
    assert telemetry_samples[0]["rssi"] == -65
    assert telemetry_samples[0]["free_heap"] == 160000


def test_device_config_fetch(setup_control_plane_tables):
    """Verify GET /v1/device/config returns full configuration."""
    device_id = setup_control_plane_tables["device_id"]

    event = {
        "requestContext": {
            "authorizer": {
                "lambda": {"device_id": device_id}
            }
        }
    }

    resp = config_handler(event, None)
    assert resp["statusCode"] == 200
    cfg = json.loads(resp["body"])

    assert "config_version" in cfg
    assert cfg["language_a"] == "en-US"
    assert cfg["language_b"] == "es-US"
    assert cfg["mode"] == "auto"
    assert cfg["heartbeat_interval_sec"] == 30


def test_command_acknowledgement(setup_control_plane_tables):
    """Verify POST /v1/device/commands/{id}/ack updates command state."""
    device_id = setup_control_plane_tables["device_id"]
    cmd_id = "cmd-123"
    enqueue_command(device_id, cmd_id, "identify")

    event = {
        "pathParameters": {"id": cmd_id},
        "body": json.dumps({"status": "done", "detail": "LED flashed 3 times"}),
        "requestContext": {
            "authorizer": {
                "lambda": {"device_id": device_id}
            }
        },
    }

    resp = commands_handler(event, None)
    assert resp["statusCode"] == 200
    data = json.loads(resp["body"])
    assert data["status"] == "acknowledged"
    assert data["command_id"] == cmd_id
