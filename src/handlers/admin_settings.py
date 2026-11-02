"""Admin settings handler.

Endpoints:
- GET /v1/admin/settings
- PUT /v1/admin/settings
"""

import json
import os
from typing import Any, Dict
from src.shared.db import get_settings, update_settings
from src.shared.logging import log_event, setup_logger

logger = setup_logger("admin_settings")

ALLOWED_SETTINGS_KEYS = {
    "service_enabled",
    "max_utterance_sec",
    "max_file_size_mb",
    "max_duration_sec",
    "retention_days",
    "store_audio",
    "language_id_min_confidence",
    "conversation_idle_sec",
    "device_rate_limit_per_min",
    "device_daily_quota",
    "default_heartbeat_interval_sec",
    "allowed_languages",
    "voice_map",
}


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")

    def json_resp(status_code: int, data: Any) -> Dict[str, Any]:
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
            },
            "body": json.dumps(data),
        }

    if http_method == "GET":
        settings = get_settings()
        return json_resp(200, settings)

    if http_method in ["PUT", "POST"]:
        body = event.get("body") or "{}"
        if isinstance(body, str):
            try:
                payload = json.loads(body)
            except Exception:
                return json_resp(400, {"error": {"code": "invalid_json", "message": "Malformed JSON payload"}})
        else:
            payload = body

        # Filter only allowed settings keys
        filtered = {k: v for k, v in payload.items() if k in ALLOWED_SETTINGS_KEYS}
        updated = update_settings(filtered)
        log_event(logger, logger.level, "Settings updated", updated_keys=list(filtered.keys()))
        return json_resp(200, updated)

    return json_resp(405, {"error": {"code": "method_not_allowed", "message": "Method not allowed"}})
