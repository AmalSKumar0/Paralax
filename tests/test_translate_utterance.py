"""Unit & Integration tests for Path A Synchronous Utterance Translation."""

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
    update_settings,
    _DDB_RESOURCE,
    _S3_CLIENT,
)
from src.handlers.translate_utterance import handler as translate_handler


@pytest.fixture
def mock_aws_env(monkeypatch):
    """Setup mock AWS resources for DynamoDB and S3."""
    with mock_aws():
        # Reset cached clients
        import src.shared.db as db_mod
        db_mod._DDB_RESOURCE = None
        db_mod._S3_CLIENT = None
        import src.handlers.translate_utterance as tr_mod
        tr_mod._TRANSLATE_CLIENT = None
        tr_mod._POLLY_CLIENT = None

        region = "us-east-1"
        monkeypatch.setenv("AWS_REGION", region)
        monkeypatch.setenv("JOBS_TABLE_NAME", "ParalaxJobs")
        monkeypatch.setenv("DEVICES_TABLE_NAME", "ParalaxDevices")
        monkeypatch.setenv("IDEMPOTENCY_TABLE_NAME", "ParalaxIdempotency")
        monkeypatch.setenv("SETTINGS_TABLE_NAME", "ParalaxSettings")
        monkeypatch.setenv("RATE_LIMITS_TABLE_NAME", "ParalaxRateLimits")
        monkeypatch.setenv("AUDIO_BUCKET_NAME", "paralax-audio-storage")
        monkeypatch.setenv("AI_PROVIDER", "aws")

        dynamodb = boto3.resource("dynamodb", region_name=region)
        s3 = boto3.client("s3", region_name=region)

        # Create Tables
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
            TableName="ParalaxIdempotency",
            KeySchema=[{"AttributeName": "idempotency_key", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "idempotency_key", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxSettings",
            KeySchema=[{"AttributeName": "setting_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "setting_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName="ParalaxRateLimits",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # Create S3 Bucket
        s3.create_bucket(Bucket="paralax-audio-storage")

        # Create sample device
        key_hash = hash_key("secret123")
        create_device(
            device_id="esp32-test-01",
            key_hash=key_hash,
            config={"mode": "auto", "language_a": "en-US", "language_b": "es-US"},
        )

        yield

        tr_mod._TRANSLATE_CLIENT = None
        tr_mod._POLLY_CLIENT = None


def test_path_a_full_flow_binary_mode(mock_aws_env, monkeypatch):
    """Verify Path A full synchronous flow with Accept: application/octet-stream."""
    # Mock Transcribe Streaming result via test hook
    monkeypatch.setenv(
        "MOCK_TRANSCRIBE_STREAMING_HOOK",
        json.dumps({
            "transcript": "Hello, how are you?",
            "detected_language": "en-US",
            "confidence": 0.98,
        }),
    )

    # Stub Amazon Translate and Polly
    translate_client = boto3.client("translate", region_name="us-east-1")
    polly_client = boto3.client("polly", region_name="us-east-1")

    translate_stub = Stubber(translate_client)
    polly_stub = Stubber(polly_client)

    translate_stub.add_response(
        "translate_text",
        {
            "TranslatedText": "Hola, ¿cómo estás?",
            "SourceLanguageCode": "en",
            "TargetLanguageCode": "es",
        },
        expected_params={
            "Text": "Hello, how are you?",
            "SourceLanguageCode": "en",
            "TargetLanguageCode": "es",
        },
    )

    # 1 second of synthetic 16kHz PCM audio synthesized
    synth_pcm = create_sine_pcm(frequency_hz=300, duration_sec=1.0)
    polly_stub.add_response(
        "synthesize_speech",
        {
            "AudioStream": io.BytesIO(synth_pcm),
            "ContentType": "audio/L16;rate=16000",
        },
        expected_params={
            "Text": "Hola, ¿cómo estás?",
            "OutputFormat": "pcm",
            "VoiceId": "Lupe",
            "Engine": "neural",
            "SampleRate": "16000",
        },
    )

    import src.handlers.translate_utterance as handler_mod
    handler_mod._TRANSLATE_CLIENT = translate_client
    handler_mod._POLLY_CLIENT = polly_client

    with translate_stub, polly_stub:
        # Input audio: 1.5s audible 440Hz PCM
        input_pcm = create_sine_pcm(frequency_hz=440, duration_sec=1.5)
        b64_audio = base64.b64encode(input_pcm).decode("ascii")

        event = {
            "headers": {
                "Content-Type": "audio/L16;rate=16000",
                "Accept": "application/octet-stream",
                "Idempotency-Key": "idemp-test-01",
            },
            "body": b64_audio,
            "isBase64Encoded": True,
            "requestContext": {
                "authorizer": {
                    "lambda": {
                        "device_id": "esp32-test-01",
                        "mode": "auto",
                        "language_a": "en-US",
                        "language_b": "es-US",
                    }
                }
            },
        }

        resp = handler_mod.handler(event, None)

        assert resp["statusCode"] == 200
        assert resp["isBase64Encoded"] is True
        headers = resp["headers"]

        # Single round-trip assertions
        assert headers["Content-Type"] == "audio/L16;rate=16000"
        assert "X-Job-Id" in headers
        assert headers["X-Detected-Language"] == "en-US"
        assert headers["X-Target-Language"] == "es-US"

        # Decode base64url headers
        def decode_b64url(s):
            padded = s + "=" * ((4 - len(s) % 4) % 4)
            return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")

        assert decode_b64url(headers["X-Transcript"]) == "Hello, how are you?"
        assert decode_b64url(headers["X-Translation"]) == "Hola, ¿cómo estás?"
        assert "X-Timings-Total-Ms" in headers

        # Verify decoded audio content matches synth_pcm
        received_audio = base64.b64decode(resp["body"])
        assert received_audio == synth_pcm

        # Verify Job in DynamoDB
        job_id = headers["X-Job-Id"]
        job = get_job(job_id)
        assert job is not None
        assert job["status"] == "COMPLETED"
        assert job["transcript"] == "Hello, how are you?"
        assert job["translation"] == "Hola, ¿cómo estás?"
        assert "timings" in job
        assert job["timings"]["total_ms"] > 0


def test_path_a_json_mode(mock_aws_env, monkeypatch):
    """Verify Path A with Accept: application/json."""
    monkeypatch.setenv(
        "MOCK_TRANSCRIBE_STREAMING_HOOK",
        json.dumps({
            "transcript": "Good morning",
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
        {
            "TranslatedText": "Buenos días",
            "SourceLanguageCode": "en",
            "TargetLanguageCode": "es",
        },
    )
    polly_stub.add_response(
        "synthesize_speech",
        {
            "AudioStream": io.BytesIO(b"\x00\x01" * 8000),
            "ContentType": "audio/L16;rate=16000",
        },
    )

    import src.handlers.translate_utterance as handler_mod
    handler_mod._TRANSLATE_CLIENT = translate_client
    handler_mod._POLLY_CLIENT = polly_client

    with translate_stub, polly_stub:
        input_pcm = create_sine_pcm(duration_sec=1.0)
        b64_audio = base64.b64encode(input_pcm).decode("ascii")

        event = {
            "headers": {
                "Accept": "application/json",
            },
            "queryStringParameters": {
                "source": "en-US",
                "target": "es-US",
            },
            "body": b64_audio,
            "isBase64Encoded": True,
        }

        resp = handler_mod.handler(event, None)
        assert resp["statusCode"] == 200
        data = json.loads(resp["body"])
        assert data["transcript"] == "Good morning"
        assert data["translation"] == "Buenos días"
        assert data["audio"]["format"] == "pcm"
        assert "timings" in data


def test_service_disabled(mock_aws_env):
    """Verify 503 service_disabled when service_enabled is false."""
    update_settings({"service_enabled": False})

    import src.handlers.translate_utterance as handler_mod
    event = {"headers": {}, "body": "dummy"}
    resp = handler_mod.handler(event, None)

    assert resp["statusCode"] == 503
    data = json.loads(resp["body"])
    assert data["error"]["code"] == "service_disabled"


def test_no_speech_detected_on_silent_audio(mock_aws_env):
    """Verify 422 no_speech_detected on near-silent audio."""
    silent_pcm = b"\x00" * 32000
    b64_silent = base64.b64encode(silent_pcm).decode("ascii")

    import src.handlers.translate_utterance as handler_mod
    event = {
        "headers": {"Content-Type": "audio/L16;rate=16000"},
        "body": b64_silent,
        "isBase64Encoded": True,
    }
    resp = handler_mod.handler(event, None)
    assert resp["statusCode"] == 422
    data = json.loads(resp["body"])
    assert data["error"]["code"] == "no_speech_detected"


def test_low_confidence_language_in_auto_mode(mock_aws_env, monkeypatch):
    """Verify 422 low_confidence_language when confidence is below threshold."""
    monkeypatch.setenv(
        "MOCK_TRANSCRIBE_STREAMING_HOOK",
        json.dumps({
            "transcript": "unintelligible noise",
            "detected_language": "en-US",
            "confidence": 0.40,  # Below default 0.65 threshold
        }),
    )

    import src.handlers.translate_utterance as handler_mod
    input_pcm = create_sine_pcm(duration_sec=1.0)
    event = {
        "headers": {"Content-Type": "audio/L16;rate=16000"},
        "body": base64.b64encode(input_pcm).decode("ascii"),
        "isBase64Encoded": True,
        "requestContext": {
            "authorizer": {
                "lambda": {
                    "device_id": "esp32-test-01",
                    "mode": "auto",
                    "language_a": "en-US",
                    "language_b": "es-US",
                }
            }
        },
    }
    resp = handler_mod.handler(event, None)
    assert resp["statusCode"] == 422
    data = json.loads(resp["body"])
    assert data["error"]["code"] == "low_confidence_language"


def test_rate_limiting_enforced(mock_aws_env):
    """Verify 429 rate_limited when request count exceeds limit."""
    # Set limit to 2 per min
    update_settings({"device_rate_limit_per_min": 2})

    import src.handlers.translate_utterance as handler_mod
    input_pcm = create_sine_pcm(duration_sec=1.0)
    event = {
        "headers": {"Content-Type": "audio/L16;rate=16000"},
        "body": base64.b64encode(input_pcm).decode("ascii"),
        "isBase64Encoded": True,
        "requestContext": {
            "authorizer": {
                "lambda": {
                    "device_id": "esp32-test-01",
                }
            }
        },
    }

    # First request
    handler_mod.handler(event, None)
    # Second request
    handler_mod.handler(event, None)
    # Third request -> 429
    resp = handler_mod.handler(event, None)
    assert resp["statusCode"] == 429
    data = json.loads(resp["body"])
    assert data["error"]["code"] == "rate_limited"
    assert "retry_after_sec" in data["error"]
