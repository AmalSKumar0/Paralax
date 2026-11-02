"""Handler for POST /v1/device/heartbeat.

Receives telemetry and heartbeat status from ESP32 device:
- Stores telemetry sample in DynamoDB with 3-day TTL
- Updates device last_heartbeat timestamp and state
- Compares device config_version with cloud config_version
- Dispatches pending commands from queue
- Returns server_time, config_version, config_changed flag, commands
"""

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict

from src.shared.db import (
    get_device,
    get_pending_commands,
    record_telemetry,
    update_device_heartbeat,
)
from src.shared.logging import log_event, setup_logger

logger = setup_logger("device_heartbeat")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    # Extract authenticated device from authorizer context
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

    body = event.get("body") or "{}"
    if isinstance(body, str):
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}
    else:
        payload = body

    firmware_version = payload.get("firmware_version", "1.0.0")
    rssi = payload.get("rssi", -60)
    free_heap = payload.get("free_heap", 150000)
    uptime_sec = payload.get("uptime_sec", 0)
    battery_pct = payload.get("battery_pct")
    device_config_version = int(payload.get("config_version", 1))

    # Fetch registered device to compare config version
    device = get_device(device_id)
    if not device:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": {"code": "device_not_found", "message": f"Device {device_id} not registered"}}),
        }

    cloud_config_version = int(device.get("config_version", 1))
    config_changed = (cloud_config_version != device_config_version)

    telemetry_data = {
        "firmware_version": firmware_version,
        "rssi": rssi,
        "free_heap": free_heap,
        "uptime_sec": uptime_sec,
        "battery_pct": battery_pct,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # 1. Update device heartbeat
    update_device_heartbeat(device_id, telemetry_data)

    # 2. Record historical telemetry sample (TTL = 3 days)
    record_telemetry(device_id, telemetry_data, ttl_days=3)

    # 3. Retrieve pending commands to dispatch to device
    pending_cmds = get_pending_commands(device_id)
    command_list = [
        {
            "id": cmd["command_id"],
            "type": cmd["type"],
            "params": cmd.get("params", {}),
        }
        for cmd in pending_cmds
    ]

    heartbeat_interval = int(device.get("config", {}).get("heartbeat_interval_sec", 30))
    server_time = datetime.now(timezone.utc).isoformat()

    response_payload = {
        "server_time": server_time,
        "config_version": cloud_config_version,
        "config_changed": config_changed,
        "heartbeat_interval_sec": heartbeat_interval,
        "commands": command_list,
    }

    log_event(
        logger,
        logger.level,
        f"Heartbeat processed for device {device_id} (commands: {len(command_list)}, config_changed: {config_changed})",
        device_id=device_id,
        rssi=rssi,
        free_heap=free_heap,
    )

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
        },
        "body": json.dumps(response_payload),
    }
