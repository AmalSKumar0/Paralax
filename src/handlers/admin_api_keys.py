"""Admin API keys management handler.

Endpoints:
- GET    /v1/admin/api-keys
- POST   /v1/admin/api-keys
- DELETE /v1/admin/api-keys/{hash}
"""

import json
import os
import secrets
from typing import Any, Dict
from src.shared.db import (
    create_api_key,
    delete_api_key,
    hash_key,
    list_api_keys,
)
from src.shared.logging import log_event, setup_logger

logger = setup_logger("admin_api_keys")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path_params = event.get("pathParameters") or {}
    key_hash = path_params.get("id") or path_params.get("hash")

    def json_resp(status_code: int, data: Any) -> Dict[str, Any]:
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
            },
            "body": json.dumps(data),
        }

    # Route: GET /v1/admin/api-keys
    if http_method == "GET":
        keys = list_api_keys()
        return json_resp(200, {"api_keys": keys})

    # Route: POST /v1/admin/api-keys
    if http_method == "POST":
        body = event.get("body") or "{}"
        if isinstance(body, str):
            try:
                payload = json.loads(body)
            except Exception:
                payload = {}
        else:
            payload = body

        name = payload.get("name", "Machine Client Key")
        scopes = payload.get("scopes", ["jobs:write", "jobs:read"])

        raw_api_key = f"ak_{secrets.token_urlsafe(32)}"
        hashed = hash_key(raw_api_key)

        created = create_api_key(hashed, name=name, scopes=scopes)
        created_resp = created.copy()
        created_resp["api_key"] = raw_api_key  # Returned once!

        log_event(logger, logger.level, f"API Key '{name}' created")
        return json_resp(201, created_resp)

    # Route: DELETE /v1/admin/api-keys/{hash}
    if http_method == "DELETE" and key_hash:
        delete_api_key(key_hash)
        return json_resp(200, {"status": "deleted", "api_key_hash": key_hash})

    return json_resp(400, {"error": {"code": "invalid_request", "message": "Invalid request"}})
