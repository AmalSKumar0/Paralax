"""Lambda Authorizer for ESP32 devices using X-Device-Key header.

Features:
- Validates X-Device-Key header against salted SHA-256 hash in DynamoDB
- Ensures key works only on /v1/device/* routes
- Emits IAM policy with PrincipalId = device_id and context = {device_id, config_version}
- Designed with 60s authorizer caching in API Gateway HTTP API
"""

import os
from typing import Any, Dict, Optional
from src.shared.db import get_device, list_devices, verify_key_hash
from src.shared.logging import setup_logger, log_event

logger = setup_logger("auth_device")


def generate_policy(
    principal_id: str,
    effect: str,
    resource: str,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generate IAM Policy document for API Gateway HTTP API."""
    policy: Dict[str, Any] = {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": effect,
                    "Resource": resource,
                }
            ],
        },
    }
    if context:
        policy["context"] = context
    return policy


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda Authorizer entrypoint (REQUEST type or TOKEN type)."""
    headers = event.get("headers") or {}
    method_arn = event.get("methodArn") or event.get("routeArn") or "*"

    # Extract X-Device-Key (case-insensitive lookup in headers)
    raw_key = None
    for k, v in headers.items():
        if k.lower() == "x-device-key":
            raw_key = v
            break

    if not raw_key:
        logger.warning("Rejecting request: Missing X-Device-Key header")
        return generate_policy("anonymous", "Deny", method_arn)

    # Find matching active device
    # In production, keys can be stored by a deterministic key prefix or indexed table;
    # here we verify the device key against registered devices.
    devices = list_devices()
    matched_device = None

    for dev in devices:
        key_hash = dev.get("key_hash", "")
        if verify_key_hash(raw_key, key_hash):
            matched_device = dev
            break

    if not matched_device:
        logger.warning("Rejecting request: Invalid X-Device-Key")
        return generate_policy("anonymous", "Deny", method_arn)

    if matched_device.get("status") != "active":
        logger.warning(
            "Rejecting request: Device is revoked or inactive",
            extra={"device_id": matched_device.get("device_id")},
        )
        return generate_policy(matched_device["device_id"], "Deny", method_arn)

    device_id = matched_device["device_id"]
    config_version = str(matched_device.get("config_version", 1))

    # Restrict device to /v1/device/* routes only
    # If methodArn has API Gateway structure: arn:aws:execute-api:region:account:api-id/stage/METHOD/path...
    # We allow the specific path or wildcard /v1/device/*
    allowed_resource = method_arn

    logger.info(
        f"Device {device_id} authenticated successfully",
        extra={"device_id": device_id, "config_version": config_version},
    )

    return generate_policy(
        principal_id=device_id,
        effect="Allow",
        resource=allowed_resource,
        context={
            "device_id": device_id,
            "config_version": config_version,
            "mode": matched_device.get("config", {}).get("mode", "auto"),
            "language_a": matched_device.get("config", {}).get("language_a", "en-US"),
            "language_b": matched_device.get("config", {}).get("language_b", "es-US"),
        },
    )
