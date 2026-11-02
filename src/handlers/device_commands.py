"""Handler for POST /v1/device/commands/{id}/ack.

Allows an ESP32 device to acknowledge execution status of a command.
"""

import json
import os
from typing import Any, Dict
from src.shared.db import ack_command
from src.shared.logging import log_event, setup_logger

logger = setup_logger("device_commands")


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

    path_params = event.get("pathParameters") or {}
    command_id = path_params.get("id")
    if not command_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": {"code": "missing_parameter", "message": "Missing command id in path"}}),
        }

    body = event.get("body") or "{}"
    if isinstance(body, str):
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}
    else:
        payload = body

    status = payload.get("status", "done")
    if status not in ["done", "failed"]:
        status = "done"
    detail = payload.get("detail", "")

    updated = ack_command(device_id, command_id, status, detail)
    if not updated:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": {"code": "command_not_found", "message": f"Command {command_id} not found for device"}}),
        }

    log_event(
        logger,
        logger.level,
        f"Command {command_id} acknowledged by device {device_id} with status: {status}",
        device_id=device_id,
        command_id=command_id,
        status=status,
    )

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
        },
        "body": json.dumps({"status": "acknowledged", "command_id": command_id}),
    }
