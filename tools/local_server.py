#!/usr/bin/env python3
"""Paralax Local Development & IoT Testing Server.

Runs the complete serverless IoT voice translator backend locally without
requiring AWS credentials, AWS SAM CLI, or Docker.

Features:
- In-memory mock DynamoDB tables and S3 audio storage (powered by Moto).
- Pre-seeded test device ("esp32-wroom-dev-01" with key "dev_secret_key_12345").
- Device authentication via X-Device-Key with salted SHA-256 verification.
- Full Path A single round-trip audio translation with binary PCM and base64url X-* headers.
- Multi-provider AI support:
    * "groq": Real-time Whisper STT + LLaMA 3.3 translation + Edge-TTS voice (Zero-cost free tier).
    * "mock": Instant offline testing with real Edge-TTS speech synthesis, no API keys needed.
    * "aws": Amazon Transcribe + Amazon Translate + Polly (if AWS credentials set).
- Binds to 0.0.0.0 to allow direct testing from physical ESP32 hardware on the same Wi-Fi LAN.
"""

import argparse
import base64
import io
import json
import os
import re
import socket
import sys
import time
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Any, Dict, List, Optional, Tuple

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Set default local AWS environment variables before boto3 loads
os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "mock_local_key")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "mock_local_secret")
os.environ.setdefault("JOBS_TABLE_NAME", "ParalaxJobs")
os.environ.setdefault("DEVICES_TABLE_NAME", "ParalaxDevices")
os.environ.setdefault("COMMANDS_TABLE_NAME", "ParalaxDeviceCommands")
os.environ.setdefault("TELEMETRY_TABLE_NAME", "ParalaxTelemetry")
os.environ.setdefault("SETTINGS_TABLE_NAME", "ParalaxSettings")
os.environ.setdefault("RATE_LIMITS_TABLE_NAME", "ParalaxRateLimits")
os.environ.setdefault("IDEMPOTENCY_TABLE_NAME", "ParalaxIdempotency")
os.environ.setdefault("API_KEYS_TABLE_NAME", "ParalaxApiKeys")
os.environ.setdefault("AUDIO_BUCKET_NAME", "paralax-audio-storage")
os.environ.setdefault("STORE_AUDIO", "true")

from moto import mock_aws
import boto3

# Import application handlers
from src.handlers import (
    admin_conversations,
    admin_devices,
    admin_health,
    admin_settings,
    admin_stats,
    auth_device,
    device_commands,
    device_config,
    device_heartbeat,
    jobs,
    translate_utterance,
)
from src.shared.db import create_device, hash_key, update_settings, get_device

# Global mock context to keep in-memory tables alive across requests
_MOCK_AWS_CONTEXT = None


def get_local_ip() -> str:
    """Detect the machine's primary local LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def stop_mock_aws_environment():
    """Stop active mock_aws context and reset."""
    global _MOCK_AWS_CONTEXT
    if _MOCK_AWS_CONTEXT is not None:
        _MOCK_AWS_CONTEXT.stop()
        _MOCK_AWS_CONTEXT = None


def init_mock_aws_environment(ai_provider: str):
    """Initialize in-memory DynamoDB tables, S3 bucket, and seed default device."""
    global _MOCK_AWS_CONTEXT
    if _MOCK_AWS_CONTEXT is None:
        _MOCK_AWS_CONTEXT = mock_aws()
        _MOCK_AWS_CONTEXT.start()

    region = os.environ.get("AWS_REGION", "us-east-1")
    dynamodb = boto3.resource("dynamodb", region_name=region)
    s3 = boto3.client("s3", region_name=region)

    # 1. Create S3 Bucket
    try:
        s3.create_bucket(Bucket=os.environ["AUDIO_BUCKET_NAME"])
    except Exception:
        pass

    # 2. Create DynamoDB Tables
    table_configs = [
        ("ParalaxJobs", "job_id"),
        ("ParalaxDevices", "device_id"),
        ("ParalaxSettings", "setting_id"),
        ("ParalaxRateLimits", "pk"),
        ("ParalaxIdempotency", "idempotency_key"),
        ("ParalaxApiKeys", "api_key_hash"),
    ]
    for table_name, pk in table_configs:
        try:
            dynamodb.create_table(
                TableName=table_name,
                KeySchema=[{"AttributeName": pk, "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": pk, "AttributeType": "S"}],
                BillingMode="PAY_PER_REQUEST",
            )
        except Exception:
            pass

    # Composite key tables
    try:
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
    except Exception:
        pass

    try:
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
    except Exception:
        pass

    # 3. Seed Default System Settings
    update_settings({
        "service_enabled": True,
        "max_utterance_sec": 15,
        "store_audio": True,
        "ai_provider": ai_provider,
        "device_rate_limit_per_min": 60,
        "device_daily_quota": 1000,
    })

    # 4. Seed Default Test Device
    # Key: "dev_secret_key_12345"
    test_device_id = "esp32-wroom-dev-01"
    raw_key = "dev_secret_key_12345"
    stored_hash = hash_key(raw_key)

    create_device(
        device_id=test_device_id,
        key_hash=stored_hash,
        config={
            "language_a": "en-US",
            "language_b": "es-US",
            "mode": "auto",
        },
    )


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server to handle concurrent device connections."""
    daemon_threads = True


class LocalApiGatewayHandler(BaseHTTPRequestHandler):
    """Emulates AWS API Gateway HTTP API proxy integration locally."""

    server_version = "ParalaxLocalGateway/1.0"

    def log_message(self, format: str, *args: Any):
        """Custom formatted log message."""
        timestamp = time.strftime("%H:%M:%S")
        sys.stderr.write(f"[{timestamp}] {self.address_string()} - {format % args}\n")

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Device-Key, Idempotency-Key, Accept, Authorization, X-Conversation-Id")
        self.send_header("Access-Control-Expose-Headers", "X-Job-Id, X-Transcript, X-Translation, X-Detected-Language, X-Source-Language, X-Target-Language, X-Timing-Total-Ms")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        self._handle_request("GET")

    def do_POST(self):
        self._handle_request("POST")

    def do_PUT(self):
        self._handle_request("PUT")

    def do_DELETE(self):
        self._handle_request("DELETE")

    def _handle_request(self, method: str):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = {k: v[0] if len(v) == 1 else v for k, v in urllib.parse.parse_qs(parsed_url.query).items()}

        # Read Request Body
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b""

        content_type = self.headers.get("Content-Type", "")
        is_binary = not (content_type.startswith("application/json") or content_type.startswith("text/"))

        # Convert headers to dict
        headers_dict = {k.lower(): v for k, v in self.headers.items()}

        # 1. Authenticate Device Requests (/v1/device/*)
        authorizer_context: Dict[str, Any] = {}
        if path.startswith("/v1/device/"):
            auth_event = {"headers": headers_dict, "routeArn": path}
            auth_policy = auth_device.handler(auth_event, None)
            stmt = auth_policy.get("policyDocument", {}).get("Statement", [{}])[0]
            effect = stmt.get("Effect", "Deny")

            if effect != "Allow":
                self._send_error_response(401, "unauthorized", "Invalid or missing X-Device-Key header")
                return

            authorizer_context = auth_policy.get("context", {})

        # 2. Build API Gateway Proxy Event
        event: Dict[str, Any] = {
            "version": "2.0",
            "routeKey": f"{method} {path}",
            "rawPath": path,
            "rawQueryString": parsed_url.query,
            "headers": headers_dict,
            "queryStringParameters": query_params,
            "requestContext": {
                "http": {
                    "method": method,
                    "path": path,
                    "protocol": "HTTP/1.1",
                    "sourceIp": self.client_address[0],
                },
                "authorizer": {
                    "lambda": authorizer_context,
                },
            },
            "isBase64Encoded": is_binary,
            "body": base64.b64encode(raw_body).decode("ascii") if is_binary else (raw_body.decode("utf-8", errors="replace") if raw_body else ""),
        }

        # 3. Route to Corresponding Handler
        try:
            response = self._dispatch_route(method, path, event)
            self._write_lambda_response(response)
        except Exception as e:
            sys.stderr.write(f"Handler error: {e}\n")
            import traceback
            traceback.print_exc()
            self._send_error_response(500, "internal_error", f"Local server error: {str(e)}")

    def _dispatch_route(self, method: str, path: str, event: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch request to appropriate Lambda handler."""
        # /v1/device/translate
        if path == "/v1/device/translate" and method == "POST":
            return translate_utterance.handler(event, None)

        # /v1/device/heartbeat
        if path == "/v1/device/heartbeat" and method == "POST":
            return device_heartbeat.handler(event, None)

        # /v1/device/config
        if path == "/v1/device/config" and method == "GET":
            return device_config.handler(event, None)

        # /v1/device/commands/{id}/ack
        cmd_ack_match = re.match(r"^/v1/device/commands/([^/]+)/ack$", path)
        if cmd_ack_match and method == "POST":
            event["pathParameters"] = {"command_id": cmd_ack_match.group(1)}
            return device_commands.handler(event, None)

        # /v1/languages
        if path == "/v1/languages" and method == "GET":
            return jobs.handler(event, None)

        # /v1/admin/health
        if path == "/v1/admin/health" and method == "GET":
            return admin_health.handler(event, None)

        # /v1/admin/devices
        if path == "/v1/admin/devices":
            return admin_devices.handler(event, None)

        # /v1/admin/settings
        if path == "/v1/admin/settings":
            return admin_settings.handler(event, None)

        # /v1/admin/stats
        if path == "/v1/admin/stats" and method == "GET":
            return admin_stats.handler(event, None)

        # /v1/admin/conversations
        if path.startswith("/v1/admin/conversations"):
            return admin_conversations.handler(event, None)

        # /v1/admin/commands
        if path == "/v1/admin/commands" and method == "POST":
            return admin_devices.handler(event, None)

        # 404 Not Found
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": {"code": "not_found", "message": f"Route not found: {method} {path}"}}),
        }

    def _write_lambda_response(self, response: Dict[str, Any]):
        """Convert Lambda proxy response dict to HTTP response."""
        status_code = response.get("statusCode", 200)
        headers = response.get("headers", {})
        body = response.get("body", "")
        is_b64 = response.get("isBase64Encoded", False)

        self.send_response(status_code)
        self._send_cors_headers()

        for k, v in headers.items():
            self.send_header(k, str(v))

        # Decode body
        if is_b64:
            body_bytes = base64.b64decode(body) if isinstance(body, str) else body
        else:
            body_bytes = body.encode("utf-8") if isinstance(body, str) else (body or b"")

        if "Content-Length" not in headers:
            self.send_header("Content-Length", str(len(body_bytes)))

        self.end_headers()
        self.wfile.write(body_bytes)

    def _send_error_response(self, status_code: int, error_code: str, message: str):
        self.send_response(status_code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        body = json.dumps({"error": {"code": error_code, "message": message}}).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Paralax Local IoT Backend Server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")), help="Port to listen on (default: 8000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host address to bind to (default: 0.0.0.0)")
    parser.add_argument("--groq-key", type=str, default=os.environ.get("GROQ_API_KEY"), help="Groq API key for free Whisper + LLaMA translation")
    parser.add_argument("--ai-provider", type=str, choices=["groq", "mock", "aws"], help="Force AI provider ('groq', 'mock', or 'aws')")
    args = parser.parse_args()

    # Determine AI provider
    if args.groq_key:
        os.environ["GROQ_API_KEY"] = args.groq_key
        ai_provider = args.ai_provider or "groq"
    elif args.ai_provider:
        ai_provider = args.ai_provider
    else:
        # Default to mock if no groq key provided for instant zero-dependency local testing
        ai_provider = "mock"

    os.environ["AI_PROVIDER"] = ai_provider

    print("==================================================================")
    print("           PARALAX LOCAL IoT TRANSLATOR SERVER                   ")
    print("==================================================================")
    print(f"[*] Bootstrapping in-memory DynamoDB & S3 via Moto...")
    init_mock_aws_environment(ai_provider)

    local_ip = get_local_ip()
    port = args.port
    host = args.host

    server_address = (host, port)
    httpd = ThreadedHTTPServer(server_address, LocalApiGatewayHandler)

    print(f"[+] Server started successfully on {host}:{port}")
    print(f"[+] Active AI Provider:  [{ai_provider.upper()}]")
    if ai_provider == "groq":
        print("    -> STT:  Groq Whisper (whisper-large-v3-turbo) [FREE TIER]")
        print("    -> LLM:  Groq LLaMA 3.3 70B Versatile          [FREE TIER]")
        print("    -> TTS:  Microsoft Edge Neural Voice           [100% FREE]")
    elif ai_provider == "mock":
        print("    -> STT:  Simulated Local Speech Recognition    [OFFLINE]")
        print("    -> LLM:  Simulated Local Translation           [OFFLINE]")
        print("    -> TTS:  Microsoft Edge Neural Voice (16kHz)   [100% FREE]")
        print("    (Tip: To use live AI, run with --groq-key gsk_... or export GROQ_API_KEY=...)")

    print(f"\n--- Network Endpoints ---")
    print(f"  * Localhost:       http://localhost:{port}")
    print(f"  * ESP32 Wi-Fi LAN: http://{local_ip}:{port}")
    print(f"\n--- Pre-Registered Test Device ---")
    print(f"  * Device ID:       esp32-wroom-dev-01")
    print(f"  * Device Key:      dev_secret_key_12345")
    print(f"  * Language Pair:   en-US <-> es-US (Mode: auto)")

    print(f"\n--- Quick Test Commands ---")
    print(f"  1. Heartbeat test:")
    print(f'     curl -X POST http://localhost:{port}/v1/device/heartbeat \\')
    print(f'       -H "X-Device-Key: dev_secret_key_12345" \\')
    print(f'       -H "Content-Type: application/json" \\')
    print(f'       -d \'{{"firmware_version": "1.0.0", "rssi": -55}}\'')

    print(f"\n  2. Hardware Simulator (Sends PCM & saves translated WAV):")
    print(f"     python3 tools/device_sim.py --api-url http://localhost:{port} --device-key dev_secret_key_12345")

    print(f"\n  3. Health Check:")
    print(f"     curl http://localhost:{port}/v1/admin/health")

    print(f"\n[!] Press Ctrl+C to stop the server.\n" + "=" * 66)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Shutting down Paralax local server...")
        httpd.server_close()
        if _MOCK_AWS_CONTEXT:
            _MOCK_AWS_CONTEXT.stop()
        print("[+] Server stopped.")


if __name__ == "__main__":
    main()
