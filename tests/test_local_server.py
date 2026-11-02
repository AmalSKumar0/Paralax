"""Unit tests for tools/local_server.py request dispatching and local emulation."""

import base64
import json
import pytest
from moto import mock_aws

from tools.local_server import (
    init_mock_aws_environment,
    stop_mock_aws_environment,
    LocalApiGatewayHandler,
)
from src.shared.audio import create_sine_pcm


class DummyServer:
    """Mock HTTP server instance for BaseHTTPRequestHandler testing."""
    def __init__(self):
        self.server_name = "localhost"
        self.server_port = 8000


@pytest.fixture
def local_server_env():
    init_mock_aws_environment("mock")
    yield
    stop_mock_aws_environment()


def test_local_server_health_route(local_server_env):
    """Verify GET /v1/admin/health dispatches correctly without authorizer."""
    handler = LocalApiGatewayHandler.__new__(LocalApiGatewayHandler)
    event = {
        "headers": {},
        "queryStringParameters": {},
        "requestContext": {"http": {"method": "GET", "path": "/v1/admin/health"}},
        "body": "",
    }
    resp = handler._dispatch_route("GET", "/v1/admin/health", event)
    assert resp["statusCode"] in [200, 503]
    body = json.loads(resp["body"])
    assert "services" in body
    assert body["services"]["dynamodb"]["status"] == "reachable"


def test_local_server_device_auth_flow(local_server_env):
    """Verify heartbeat with pre-seeded device key succeeds."""
    handler = LocalApiGatewayHandler.__new__(LocalApiGatewayHandler)
    auth_ctx = {
        "device_id": "esp32-wroom-dev-01",
        "config_version": "1",
        "mode": "auto",
        "language_a": "en-US",
        "language_b": "es-US",
    }
    event = {
        "headers": {"x-device-key": "dev_secret_key_12345"},
        "queryStringParameters": {},
        "requestContext": {
            "http": {"method": "POST", "path": "/v1/device/heartbeat"},
            "authorizer": {"lambda": auth_ctx},
        },
        "body": json.dumps({"firmware_version": "1.0.0", "rssi": -60}),
    }
    resp = handler._dispatch_route("POST", "/v1/device/heartbeat", event)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["config_version"] == 1


def test_local_server_translate_dispatch(local_server_env):
    """Verify single round-trip audio translation dispatch with mock provider."""
    handler = LocalApiGatewayHandler.__new__(LocalApiGatewayHandler)
    audio_pcm = create_sine_pcm(frequency_hz=440.0, duration_sec=1.0)
    auth_ctx = {
        "device_id": "esp32-wroom-dev-01",
        "config_version": "1",
        "mode": "auto",
        "language_a": "en-US",
        "language_b": "es-US",
    }
    event = {
        "headers": {
            "content-type": "audio/L16;rate=16000",
            "accept": "application/octet-stream",
            "idempotency-key": "local-test-key-01",
        },
        "queryStringParameters": {"source": "auto"},
        "requestContext": {
            "http": {"method": "POST", "path": "/v1/device/translate"},
            "authorizer": {"lambda": auth_ctx},
        },
        "isBase64Encoded": True,
        "body": base64.b64encode(audio_pcm).decode("ascii"),
    }
    resp = handler._dispatch_route("POST", "/v1/device/translate", event)
    assert resp["statusCode"] == 200
    assert resp["isBase64Encoded"] is True
    assert "X-Transcript" in resp["headers"]
    assert "X-Translation" in resp["headers"]
