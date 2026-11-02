"""Handler for GET /v1/device/config.

Returns the active configuration parameters for the authenticated device.
"""

import json
import os
from typing import Any, Dict
from src.shared.db import get_device
from src.shared.logging import setup_logger

logger = setup_logger("device_config")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    request_ctx = event.get("requestContext") or {}
    auth_ctx = request_ctx.get("authorizer") or {}
    lambda_ctx = auth_ctx.get("lambda") or auth_ctx

    device_id = lambda_ctx.get("device_id")
    if not device_id:
        return {
            "statusCode": 401,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": {"code": "unauthorized", "message": "Missing device authorization"}}),
        }

    device = get_device(device_id)
    if not device:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": {"code": "device_not_found", "message": f"Device {device_id} not found"}}),
        }

    cfg = device.get("config", {})
    response_payload = {
        "config_version": int(device.get("config_version", 1)),
        "language_a": cfg.get("language_a", "en-US"),
        "language_b": cfg.get("language_b", "es-US"),
        "mode": cfg.get("mode", "auto"),
        "voice_map": cfg.get("voice_map", {}),
        "speech_rate_pct": int(cfg.get("speech_rate_pct", 100)),
        "volume_pct": int(cfg.get("volume_pct", 100)),
        "max_recording_sec": int(cfg.get("max_recording_sec", 15)),
        "heartbeat_interval_sec": int(cfg.get("heartbeat_interval_sec", 30)),
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
        },
        "body": json.dumps(response_payload),
    }
