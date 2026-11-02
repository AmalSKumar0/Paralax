"""Unit tests for Lambda Device Authorizer."""

import os
import pytest
from moto import mock_aws
import boto3

from src.shared.db import create_device, hash_key, revoke_device
from src.handlers.auth_device import handler as auth_handler


@pytest.fixture
def setup_tables(monkeypatch):
    """Setup mocked DynamoDB tables for authorizer tests."""
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        # Devices table
        dev_table = dynamodb.create_table(
            TableName="ParalaxDevices",
            KeySchema=[{"AttributeName": "device_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "device_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        monkeypatch.setenv("DEVICES_TABLE_NAME", "ParalaxDevices")
        monkeypatch.setenv("AWS_REGION", "us-east-1")

        # Create active test device
        raw_key = "test_device_secret_key_999"
        key_hash = hash_key(raw_key)
        create_device(
            device_id="esp32-unit-01",
            key_hash=key_hash,
            config={"mode": "auto", "language_a": "en-US", "language_b": "es-ES"},
        )

        yield {"raw_key": raw_key, "device_id": "esp32-unit-01"}


def test_auth_missing_header():
    """Verify missing X-Device-Key produces Deny policy."""
    event = {
        "headers": {},
        "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/dev/POST/v1/device/translate",
    }
    policy = auth_handler(event, None)
    assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"


def test_auth_invalid_key(setup_tables):
    """Verify wrong key produces Deny policy."""
    event = {
        "headers": {"X-Device-Key": "completely_wrong_key"},
        "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/dev/POST/v1/device/translate",
    }
    policy = auth_handler(event, None)
    assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"


def test_auth_valid_active_key(setup_tables):
    """Verify valid key produces Allow policy with device context."""
    raw_key = setup_tables["raw_key"]
    device_id = setup_tables["device_id"]

    event = {
        "headers": {"X-Device-Key": raw_key},
        "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/dev/POST/v1/device/translate",
    }
    policy = auth_handler(event, None)

    assert policy["principalId"] == device_id
    assert policy["policyDocument"]["Statement"][0]["Effect"] == "Allow"
    ctx = policy["context"]
    assert ctx["device_id"] == device_id
    assert ctx["config_version"] == "1"
    assert ctx["mode"] == "auto"
    assert ctx["language_a"] == "en-US"
    assert ctx["language_b"] == "es-ES"


def test_auth_revoked_device(setup_tables):
    """Verify revoked device key produces Deny policy."""
    device_id = setup_tables["device_id"]
    raw_key = setup_tables["raw_key"]

    # Revoke device
    revoke_device(device_id)

    event = {
        "headers": {"X-Device-Key": raw_key},
        "methodArn": "arn:aws:execute-api:us-east-1:123456789012:api-id/dev/POST/v1/device/translate",
    }
    policy = auth_handler(event, None)
    assert policy["policyDocument"]["Statement"][0]["Effect"] == "Deny"
