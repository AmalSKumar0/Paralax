"""Contract tests verifying OpenAPI specification integrity and response structures."""

import json
from pathlib import Path
import pytest
import yaml

OPENAPI_PATH = Path(__file__).resolve().parent.parent / "openapi.yaml"


@pytest.fixture(scope="module")
def openapi_spec():
    with open(OPENAPI_PATH, "r", encoding="utf-8") as f:
        spec = yaml.safe_load(f)
    return spec


def test_openapi_spec_structure(openapi_spec):
    """Verify OpenAPI 3.0 required root keys and version."""
    assert openapi_spec.get("openapi") == "3.0.3"
    assert "info" in openapi_spec
    assert "paths" in openapi_spec
    assert "components" in openapi_spec


def test_openapi_paths_coverage(openapi_spec):
    """Verify all required device, dashboard, and admin paths exist in openapi.yaml."""
    paths = openapi_spec["paths"]

    # Device routes
    assert "/device/translate" in paths
    assert "/device/heartbeat" in paths
    assert "/device/config" in paths
    assert "/device/commands/{id}/ack" in paths

    # Dashboard / machine clients
    assert "/utterances" in paths
    assert "/uploads" in paths
    assert "/jobs" in paths
    assert "/jobs/{job_id}" in paths
    assert "/languages" in paths

    # Admin routes
    assert "/admin/jobs" in paths
    assert "/admin/jobs/{id}/retry" in paths
    assert "/admin/jobs/{id}/cancel" in paths
    assert "/admin/devices" in paths
    assert "/admin/settings" in paths
    assert "/admin/stats" in paths
    assert "/admin/health" in paths


def test_error_schema_codes(openapi_spec):
    """Verify error schema includes all required machine-readable error codes."""
    schemas = openapi_spec["components"]["schemas"]
    assert "ErrorResponse" in schemas
    error_prop = schemas["ErrorResponse"]["properties"]["error"]["properties"]

    assert "code" in error_prop
    codes = error_prop["code"]["enum"]

    required_codes = [
        "unsupported_language_pair",
        "no_speech_detected",
        "low_confidence_language",
        "audio_too_long",
        "invalid_audio_format",
        "rate_limited",
        "quota_exceeded",
        "service_disabled",
        "in_progress",
        "already_completed",
    ]

    for req_code in required_codes:
        assert req_code in codes, f"Required error code {req_code} missing from OpenAPI enum"


def test_utterance_response_schema(openapi_spec):
    """Verify UtteranceResponse contains required fields: transcript, translation, audio, timings."""
    schemas = openapi_spec["components"]["schemas"]
    assert "UtteranceResponse" in schemas
    props = schemas["UtteranceResponse"]["properties"]

    for field in ["job_id", "conversation_id", "transcript", "translation", "audio", "timings"]:
        assert field in props, f"Missing field {field} in UtteranceResponse"
