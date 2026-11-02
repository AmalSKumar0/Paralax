"""Unit tests for DynamoDB-backed idempotency mechanism."""

import time
import pytest
from moto import mock_aws
import boto3

from src.shared.db import (
    get_idempotency_record,
    set_idempotency_in_progress,
    complete_idempotency_record,
    IdempotencyInProgress,
)


@pytest.fixture
def setup_idempotency_table(monkeypatch):
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName="ParalaxIdempotency",
            KeySchema=[{"AttributeName": "idempotency_key", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "idempotency_key", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        monkeypatch.setenv("IDEMPOTENCY_TABLE_NAME", "ParalaxIdempotency")
        yield


def test_idempotency_lifecycle(setup_idempotency_table):
    """Verify in-progress locking, conflict rejection, and completion."""
    device_id = "esp32-dev-01"
    key = "req-uuid-abc-123"

    # Step 1: Initial request sets status to IN_PROGRESS
    set_idempotency_in_progress(device_id, key, job_id="job-001", ttl_hours=24)

    record = get_idempotency_record(device_id, key)
    assert record is not None
    assert record["status"] == "IN_PROGRESS"
    assert record["job_id"] == "job-001"

    # Step 2: Concurrent request with same key triggers IdempotencyInProgress
    with pytest.raises(IdempotencyInProgress):
        set_idempotency_in_progress(device_id, key, job_id="job-002")

    # Step 3: Complete execution and store response
    headers = {"Content-Type": "application/json", "X-Job-Id": "job-001"}
    body = '{"success": true}'
    complete_idempotency_record(device_id, key, headers, body, is_binary=False)

    completed_record = get_idempotency_record(device_id, key)
    assert completed_record["status"] == "COMPLETED"
    assert completed_record["response_headers"] == headers
    assert completed_record["response_body"] == body
    assert completed_record["is_binary"] is False
