"""Admin handler for device management.

Endpoints supported:
- GET  /v1/admin/devices
- POST /v1/admin/devices
- GET  /v1/admin/devices/{id}
- PATCH /v1/admin/devices/{id}
- DELETE /v1/admin/devices/{id}
- PUT  /v1/admin/devices/{id}/config
- POST /v1/admin/devices/{id}/rotate-key
- POST /v1/admin/devices/{id}/revoke
- POST /v1/admin/devices/{id}/commands
- GET  /v1/admin/devices/{id}/commands
- GET  /v1/admin/devices/{id}/telemetry
"""

import json
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.shared.db import (
    create_device,
    delete_audio,
    delete_device,
    enqueue_command,
    get_device,
    get_dynamodb,
    get_s3,
    hash_key,
    list_commands,
    list_devices,
    query_telemetry,
    revoke_device,
    rotate_device_key,
    update_device_config,
    JOBS_TABLE_NAME,
    AUDIO_BUCKET_NAME,
)
from src.shared.logging import log_event, setup_logger

logger = setup_logger("admin_devices")


def is_device_online(dev: Dict[str, Any]) -> bool:
    """A device is online if it sent a heartbeat within 3x its heartbeat interval."""
    last_hb = dev.get("last_heartbeat")
    if not last_hb or not last_hb.get("timestamp"):
        return False

    interval = int(dev.get("config", {}).get("heartbeat_interval_sec", 30))
    threshold_sec = 3 * interval

    try:
        hb_time = datetime.fromisoformat(last_hb["timestamp"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        elapsed = (now - hb_time).total_seconds()
        return elapsed <= threshold_sec
    except Exception:
        return False


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("path") or event.get("rawPath") or ""
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}
    device_id = path_params.get("id")

    # Helper for JSON response
    def json_resp(status_code: int, data: Any) -> Dict[str, Any]:
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
            },
            "body": json.dumps(data),
        }

    def parse_body():
        b = event.get("body") or "{}"
        if isinstance(b, str):
            try:
                return json.loads(b)
            except Exception:
                return {}
        return b

    # Route: GET /v1/admin/devices
    if http_method == "GET" and not device_id:
        devices = list_devices()
        enriched = []
        for d in devices:
            d_copy = d.copy()
            d_copy.pop("key_hash", None)  # Never expose key hash to admin UI
            d_copy["online"] = is_device_online(d)
            enriched.append(d_copy)
        return json_resp(200, {"devices": enriched})

    # Route: POST /v1/admin/devices (provision new device)
    if http_method == "POST" and not device_id:
        body = parse_body()
        new_id = body.get("device_id") or f"esp32_{secrets.token_hex(4)}"
        # Generate raw 32-char secret device key returned ONCE
        raw_key = f"key_{secrets.token_urlsafe(24)}"
        key_hash = hash_key(raw_key)

        created = create_device(
            device_id=new_id,
            key_hash=key_hash,
            config=body.get("config"),
        )
        created_resp = created.copy()
        created_resp.pop("key_hash", None)
        created_resp["device_key"] = raw_key  # Provided once!
        created_resp["online"] = False

        log_event(logger, logger.level, f"Device {new_id} provisioned", device_id=new_id)
        return json_resp(201, created_resp)

    # All subsequent routes require device_id
    if not device_id:
        return json_resp(400, {"error": {"code": "missing_id", "message": "Missing device id"}})

    # Route: GET /v1/admin/devices/{id}
    if http_method == "GET" and path.endswith(f"/devices/{device_id}"):
        dev = get_device(device_id)
        if not dev:
            return json_resp(404, {"error": {"code": "not_found", "message": "Device not found"}})
        dev.pop("key_hash", None)
        dev["online"] = is_device_online(dev)
        return json_resp(200, dev)

    # Route: PUT /v1/admin/devices/{id}/config
    if (http_method == "PUT" or http_method == "POST") and "/config" in path:
        body = parse_body()
        updated = update_device_config(device_id, body)
        if not updated:
            return json_resp(404, {"error": {"code": "not_found", "message": "Device not found"}})
        updated.pop("key_hash", None)
        updated["online"] = is_device_online(updated)
        return json_resp(200, updated)

    # Route: POST /v1/admin/devices/{id}/rotate-key
    if http_method == "POST" and "/rotate-key" in path:
        new_raw_key = f"key_{secrets.token_urlsafe(24)}"
        new_hash = hash_key(new_raw_key)
        updated = rotate_device_key(device_id, new_hash)
        if not updated:
            return json_resp(404, {"error": {"code": "not_found", "message": "Device not found"}})
        return json_resp(200, {
            "device_id": device_id,
            "device_key": new_raw_key,
            "message": "Key rotated successfully. Store this key securely; it will not be shown again.",
        })

    # Route: POST /v1/admin/devices/{id}/revoke
    if http_method == "POST" and "/revoke" in path:
        updated = revoke_device(device_id)
        if not updated:
            return json_resp(404, {"error": {"code": "not_found", "message": "Device not found"}})
        return json_resp(200, {"device_id": device_id, "status": "revoked"})

    # Route: POST /v1/admin/devices/{id}/commands
    if http_method == "POST" and "/commands" in path:
        body = parse_body()
        cmd_type = body.get("type")
        if cmd_type not in ["reboot", "sync_config", "identify"]:
            return json_resp(400, {"error": {"code": "invalid_command_type", "message": "Command type must be reboot, sync_config, or identify"}})
        cmd_id = f"cmd_{secrets.token_hex(6)}"
        created_cmd = enqueue_command(device_id, cmd_id, cmd_type, body.get("params"))
        return json_resp(201, created_cmd)

    # Route: GET /v1/admin/devices/{id}/commands
    if http_method == "GET" and "/commands" in path:
        cmds = list_commands(device_id)
        return json_resp(200, {"commands": cmds})

    # Route: GET /v1/admin/devices/{id}/telemetry
    if http_method == "GET" and "/telemetry" in path:
        from_iso = query_params.get("from")
        to_iso = query_params.get("to")
        samples = query_telemetry(device_id, from_iso, to_iso)
        return json_resp(200, {"device_id": device_id, "telemetry": samples})

    # Route: DELETE /v1/admin/devices/{id}
    if http_method == "DELETE":
        dev = get_device(device_id)
        if not dev:
            return json_resp(404, {"error": {"code": "not_found", "message": "Device not found"}})

        # Requirement: "Deleting a device deletes its stored data"
        # 1. Query all jobs associated with device_id
        table = get_dynamodb().Table(JOBS_TABLE_NAME)
        from boto3.dynamodb.conditions import Attr
        jobs_resp = table.scan(FilterExpression=Attr("device_id").eq(device_id))
        jobs = jobs_resp.get("Items", [])

        # 2. Delete S3 objects and job records
        for j in jobs:
            if j.get("audio_input_s3_key"):
                delete_audio(j["audio_input_s3_key"])
            if j.get("audio_output_s3_key"):
                delete_audio(j["audio_output_s3_key"])
            table.delete_item(Key={"job_id": j["job_id"]})

        # 3. Delete device record
        delete_device(device_id)

        log_event(logger, logger.level, f"Device {device_id} and all stored data deleted", device_id=device_id)
        return json_resp(200, {"status": "deleted", "device_id": device_id, "deleted_jobs_count": len(jobs)})

    return json_resp(404, {"error": {"code": "not_found", "message": "Route not found"}})
