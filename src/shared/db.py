"""DynamoDB and S3 persistence layer with atomic operations and pagination."""

import base64
import hashlib
import json
import os
import secrets
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
import boto3
from botocore.exceptions import ClientError

# Table and bucket names from environment variables
JOBS_TABLE_NAME = os.environ.get("JOBS_TABLE_NAME", "ParalaxJobs")
DEVICES_TABLE_NAME = os.environ.get("DEVICES_TABLE_NAME", "ParalaxDevices")
IDEMPOTENCY_TABLE_NAME = os.environ.get("IDEMPOTENCY_TABLE_NAME", "ParalaxIdempotency")
COMMANDS_TABLE_NAME = os.environ.get("COMMANDS_TABLE_NAME", "ParalaxDeviceCommands")
TELEMETRY_TABLE_NAME = os.environ.get("TELEMETRY_TABLE_NAME", "ParalaxTelemetry")
SETTINGS_TABLE_NAME = os.environ.get("SETTINGS_TABLE_NAME", "ParalaxSettings")
API_KEYS_TABLE_NAME = os.environ.get("API_KEYS_TABLE_NAME", "ParalaxApiKeys")
RATE_LIMITS_TABLE_NAME = os.environ.get("RATE_LIMITS_TABLE_NAME", "ParalaxRateLimits")
AUDIO_BUCKET_NAME = os.environ.get("AUDIO_BUCKET_NAME", "paralax-audio-storage")

_DDB_RESOURCE = None
_S3_CLIENT = None


def get_dynamodb():
    """Return cached boto3 DynamoDB resource."""
    global _DDB_RESOURCE
    if _DDB_RESOURCE is None:
        _DDB_RESOURCE = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _DDB_RESOURCE


def get_s3():
    """Return cached boto3 S3 client."""
    global _S3_CLIENT
    if _S3_CLIENT is None:
        _S3_CLIENT = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _S3_CLIENT


# Helper to convert Floats to Decimals for DynamoDB
def decimalize(obj: Any) -> Any:
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: decimalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [decimalize(v) for v in obj]
    return obj


# Helper to convert Decimals to Python primitives for JSON
def undecimalize(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: undecimalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [undecimalize(v) for v in obj]
    return obj


# ----------------------------------------------------------------------
# Key Hashing Utilities
# ----------------------------------------------------------------------
def hash_key(raw_key: str, salt: Optional[str] = None) -> str:
    """Generate salted SHA-256 hash formatted as salt:hex_digest."""
    if not salt:
        salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{raw_key}".encode("utf-8")).hexdigest()
    return f"{salt}:{digest}"


def verify_key_hash(raw_key: str, stored_hash: str) -> bool:
    """Verify raw key against stored salt:hex_digest."""
    if not stored_hash or ":" not in stored_hash:
        return False
    salt, expected_digest = stored_hash.split(":", 1)
    actual_digest = hashlib.sha256(f"{salt}:{raw_key}".encode("utf-8")).hexdigest()
    return secrets.compare_digest(actual_digest, expected_digest)


# ----------------------------------------------------------------------
# Idempotency
# ----------------------------------------------------------------------
class IdempotencyInProgress(Exception):
    """Raised when an operation with the same Idempotency-Key is currently running."""
    pass


def get_idempotency_record(device_id: str, key: str) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(IDEMPOTENCY_TABLE_NAME)
    full_key = f"{device_id}:{key}"
    resp = table.get_item(Key={"idempotency_key": full_key})
    item = resp.get("Item")
    return undecimalize(item) if item else None


def set_idempotency_in_progress(device_id: str, key: str, job_id: str, ttl_hours: int = 24) -> None:
    table = get_dynamodb().Table(IDEMPOTENCY_TABLE_NAME)
    full_key = f"{device_id}:{key}"
    now = int(time.time())
    expires_at = now + (ttl_hours * 3600)

    try:
        table.put_item(
            Item={
                "idempotency_key": full_key,
                "job_id": job_id,
                "status": "IN_PROGRESS",
                "created_at": now,
                "expires_at": expires_at,
            },
            ConditionExpression="attribute_not_exists(idempotency_key)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            existing = get_idempotency_record(device_id, key)
            if existing and existing.get("status") == "IN_PROGRESS":
                raise IdempotencyInProgress("A request with this Idempotency-Key is currently in progress.")
        raise


def complete_idempotency_record(
    device_id: str,
    key: str,
    response_headers: Dict[str, str],
    response_body: str,
    is_binary: bool = False,
) -> None:
    table = get_dynamodb().Table(IDEMPOTENCY_TABLE_NAME)
    full_key = f"{device_id}:{key}"
    table.update_item(
        Key={"idempotency_key": full_key},
        UpdateExpression="SET #s = :status, response_headers = :headers, response_body = :body, is_binary = :binary",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":status": "COMPLETED",
            ":headers": response_headers,
            ":body": response_body,
            ":binary": is_binary,
        },
    )


# ----------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------
DEFAULT_SETTINGS: Dict[str, Any] = {
    "setting_id": "global",
    "service_enabled": True,
    "ai_provider": os.environ.get("AI_PROVIDER", "aws"),
    "max_utterance_sec": 15,
    "max_file_size_mb": 50,
    "max_duration_sec": 300,
    "retention_days": 30,
    "store_audio": True,
    "language_id_min_confidence": 0.65,
    "conversation_idle_sec": 120,
    "device_rate_limit_per_min": 20,
    "device_daily_quota": 500,
    "default_heartbeat_interval_sec": 30,
    "allowed_languages": [
        "en-US", "en-GB", "es-US", "es-ES", "fr-FR", "de-DE", "it-IT",
        "ja-JP", "ko-KR", "pt-BR", "zh-CN", "hi-IN"
    ],
    "voice_map": {},
}


def get_settings() -> Dict[str, Any]:
    table = get_dynamodb().Table(SETTINGS_TABLE_NAME)
    try:
        resp = table.get_item(Key={"setting_id": "global"})
        item = resp.get("Item")
        if item:
            return undecimalize(item)
    except Exception:
        pass
    return DEFAULT_SETTINGS.copy()


def update_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    table = get_dynamodb().Table(SETTINGS_TABLE_NAME)
    current = get_settings()
    current.update(updates)
    current["setting_id"] = "global"
    current["updated_at"] = datetime.now(timezone.utc).isoformat()
    table.put_item(Item=decimalize(current))
    return current


# ----------------------------------------------------------------------
# Rate Limiting & Quotas
# ----------------------------------------------------------------------
def check_and_increment_rate_limit(device_id: str, limit_per_min: int) -> Tuple[bool, int]:
    """Check rate limit for current minute window.
    
    Returns:
        (is_allowed, retry_after_sec)
    """
    table = get_dynamodb().Table(RATE_LIMITS_TABLE_NAME)
    now = int(time.time())
    current_minute = now // 60
    pk = f"RATE:{device_id}:{current_minute}"
    ttl = now + 300  # expire in 5 minutes

    try:
        resp = table.update_item(
            Key={"pk": pk},
            UpdateExpression="SET #c = if_not_exists(#c, :zero) + :one, expires_at = :ttl",
            ExpressionAttributeNames={"#c": "count"},
            ExpressionAttributeValues={":zero": 0, ":one": 1, ":ttl": ttl},
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp["Attributes"]["count"])
        if count > limit_per_min:
            retry_after = 60 - (now % 60)
            return False, max(1, retry_after)
        return True, 0
    except Exception:
        return True, 0


def check_and_increment_daily_quota(device_id: str, daily_quota: int) -> Tuple[bool, int]:
    """Check daily quota for device.
    
    Returns:
        (is_allowed, retry_after_sec)
    """
    table = get_dynamodb().Table(RATE_LIMITS_TABLE_NAME)
    now = int(time.time())
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pk = f"QUOTA:{device_id}:{today_str}"
    ttl = now + (48 * 3600)

    try:
        resp = table.update_item(
            Key={"pk": pk},
            UpdateExpression="SET #c = if_not_exists(#c, :zero) + :one, expires_at = :ttl",
            ExpressionAttributeNames={"#c": "count"},
            ExpressionAttributeValues={":zero": 0, ":one": 1, ":ttl": ttl},
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp["Attributes"]["count"])
        if count > daily_quota:
            # Seconds until next midnight UTC
            next_midnight = ((now // 86400) + 1) * 86400
            retry_after = max(1, next_midnight - now)
            return False, retry_after
        return True, 0
    except Exception:
        return True, 0


# ----------------------------------------------------------------------
# Devices
# ----------------------------------------------------------------------
def create_device(
    device_id: str,
    key_hash: str,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()

    default_config = {
        "language_a": "en-US",
        "language_b": "es-US",
        "mode": "auto",
        "voice_map": {},
        "speech_rate_pct": 100,
        "volume_pct": 100,
        "max_recording_sec": 15,
        "heartbeat_interval_sec": 30,
    }
    if config:
        default_config.update(config)

    item = {
        "device_id": device_id,
        "key_hash": key_hash,
        "status": "active",
        "config_version": 1,
        "config": default_config,
        "created_at": now,
        "updated_at": now,
    }

    table.put_item(Item=decimalize(item))
    return undecimalize(item)


def get_device(device_id: str) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    resp = table.get_item(Key={"device_id": device_id})
    item = resp.get("Item")
    return undecimalize(item) if item else None


def update_device_heartbeat(
    device_id: str,
    telemetry: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()

    resp = table.update_item(
        Key={"device_id": device_id},
        UpdateExpression="SET last_heartbeat = :telemetry, updated_at = :now",
        ExpressionAttributeValues={
            ":telemetry": decimalize(telemetry),
            ":now": now,
        },
        ReturnValues="ALL_NEW",
    )
    return undecimalize(resp.get("Attributes"))


def update_device_config(
    device_id: str,
    config_updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    device = get_device(device_id)
    if not device:
        return None

    current_config = device.get("config", {})
    current_config.update(config_updates)
    new_version = int(device.get("config_version", 1)) + 1
    now = datetime.now(timezone.utc).isoformat()

    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    resp = table.update_item(
        Key={"device_id": device_id},
        UpdateExpression="SET config = :config, config_version = :version, updated_at = :now",
        ExpressionAttributeValues={
            ":config": decimalize(current_config),
            ":version": new_version,
            ":now": now,
        },
        ReturnValues="ALL_NEW",
    )
    return undecimalize(resp.get("Attributes"))


def rotate_device_key(device_id: str, new_key_hash: str) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()
    resp = table.update_item(
        Key={"device_id": device_id},
        UpdateExpression="SET key_hash = :hash, updated_at = :now",
        ExpressionAttributeValues={":hash": new_key_hash, ":now": now},
        ReturnValues="ALL_NEW",
    )
    return undecimalize(resp.get("Attributes"))


def revoke_device(device_id: str) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()
    resp = table.update_item(
        Key={"device_id": device_id},
        UpdateExpression="SET #s = :revoked, updated_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":revoked": "revoked", ":now": now},
        ReturnValues="ALL_NEW",
    )
    return undecimalize(resp.get("Attributes"))


def list_devices() -> List[Dict[str, Any]]:
    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    resp = table.scan()
    items = resp.get("Items", [])
    return [undecimalize(item) for item in items]


def delete_device(device_id: str) -> None:
    table = get_dynamodb().Table(DEVICES_TABLE_NAME)
    table.delete_item(Key={"device_id": device_id})


# ----------------------------------------------------------------------
# Telemetry
# ----------------------------------------------------------------------
def record_telemetry(device_id: str, data: Dict[str, Any], ttl_days: int = 3) -> None:
    table = get_dynamodb().Table(TELEMETRY_TABLE_NAME)
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    expires_at = int(now_dt.timestamp()) + (ttl_days * 86400)

    item = {
        "device_id": device_id,
        "timestamp": now_iso,
        "rssi": data.get("rssi"),
        "free_heap": data.get("free_heap"),
        "battery_pct": data.get("battery_pct"),
        "uptime_sec": data.get("uptime_sec"),
        "firmware_version": data.get("firmware_version"),
        "expires_at": expires_at,
    }
    table.put_item(Item=decimalize(item))


def query_telemetry(device_id: str, from_iso: Optional[str] = None, to_iso: Optional[str] = None) -> List[Dict[str, Any]]:
    table = get_dynamodb().Table(TELEMETRY_TABLE_NAME)
    from boto3.dynamodb.conditions import Key

    key_expr = Key("device_id").eq(device_id)
    if from_iso and to_iso:
        key_expr = key_expr & Key("timestamp").between(from_iso, to_iso)
    elif from_iso:
        key_expr = key_expr & Key("timestamp").gte(from_iso)

    resp = table.query(KeyConditionExpression=key_expr, Limit=100)
    return [undecimalize(item) for item in resp.get("Items", [])]


# ----------------------------------------------------------------------
# Device Commands
# ----------------------------------------------------------------------
def enqueue_command(device_id: str, command_id: str, cmd_type: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    table = get_dynamodb().Table(COMMANDS_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "device_id": device_id,
        "command_id": command_id,
        "type": cmd_type,
        "params": params or {},
        "status": "pending",
        "created_at": now,
    }
    table.put_item(Item=decimalize(item))
    return undecimalize(item)


def get_pending_commands(device_id: str) -> List[Dict[str, Any]]:
    table = get_dynamodb().Table(COMMANDS_TABLE_NAME)
    from boto3.dynamodb.conditions import Key, Attr
    resp = table.query(
        KeyConditionExpression=Key("device_id").eq(device_id),
        FilterExpression=Attr("status").eq("pending"),
    )
    items = [undecimalize(i) for i in resp.get("Items", [])]
    # Mark them delivered
    now = datetime.now(timezone.utc).isoformat()
    for item in items:
        table.update_item(
            Key={"device_id": device_id, "command_id": item["command_id"]},
            UpdateExpression="SET #s = :delivered, delivered_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":delivered": "delivered", ":now": now},
        )
    return items


def ack_command(device_id: str, command_id: str, status: str, detail: Optional[str] = None) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(COMMANDS_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()
    try:
        resp = table.update_item(
            Key={"device_id": device_id, "command_id": command_id},
            UpdateExpression="SET #s = :st, acked_at = :now, detail = :d",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":st": status,
                ":now": now,
                ":d": detail or "",
            },
            ReturnValues="ALL_NEW",
        )
        return undecimalize(resp.get("Attributes"))
    except ClientError:
        return None


def list_commands(device_id: str) -> List[Dict[str, Any]]:
    table = get_dynamodb().Table(COMMANDS_TABLE_NAME)
    from boto3.dynamodb.conditions import Key
    resp = table.query(KeyConditionExpression=Key("device_id").eq(device_id))
    return [undecimalize(i) for i in resp.get("Items", [])]


# ----------------------------------------------------------------------
# Jobs Table
# ----------------------------------------------------------------------
def create_job(
    job_id: str,
    kind: str,
    device_id: Optional[str],
    conversation_id: str,
    status: str,
    source_language: str,
    target_language: str,
    retention_days: int = 30,
    **kwargs: Any,
) -> Dict[str, Any]:
    table = get_dynamodb().Table(JOBS_TABLE_NAME)
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    expires_at = int(now_dt.timestamp()) + (retention_days * 86400)

    item: Dict[str, Any] = {
        "job_id": job_id,
        "kind": kind,
        "device_id": device_id or "system",
        "conversation_id": conversation_id,
        "status": status,
        "source_language": source_language,
        "target_language": target_language,
        "created_at": now_iso,
        "updated_at": now_iso,
        "expires_at": expires_at,
    }
    item.update(kwargs)
    table.put_item(Item=decimalize(item))
    return undecimalize(item)


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(JOBS_TABLE_NAME)
    resp = table.get_item(Key={"job_id": job_id})
    item = resp.get("Item")
    return undecimalize(item) if item else None


def update_job(job_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(JOBS_TABLE_NAME)
    now_iso = datetime.now(timezone.utc).isoformat()
    updates["updated_at"] = now_iso

    set_clauses = []
    expr_names = {}
    expr_values = {}

    for idx, (k, v) in enumerate(updates.items()):
        alias_k = f"#f{idx}"
        alias_v = f":v{idx}"
        set_clauses.append(f"{alias_k} = {alias_v}")
        expr_names[alias_k] = k
        expr_values[alias_v] = decimalize(v)

    update_expr = "SET " + ", ".join(set_clauses)
    try:
        resp = table.update_item(
            Key={"job_id": job_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        return undecimalize(resp.get("Attributes"))
    except ClientError:
        return None


def list_jobs(
    status: Optional[str] = None,
    kind: Optional[str] = None,
    device_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    language: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 50,
    cursor: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    table = get_dynamodb().Table(JOBS_TABLE_NAME)
    from boto3.dynamodb.conditions import Attr

    filter_expr = None

    def add_filter(expr):
        nonlocal filter_expr
        filter_expr = expr if filter_expr is None else filter_expr & expr

    if status:
        add_filter(Attr("status").eq(status))
    if kind:
        add_filter(Attr("kind").eq(kind))
    if device_id:
        add_filter(Attr("device_id").eq(device_id))
    if conversation_id:
        add_filter(Attr("conversation_id").eq(conversation_id))
    if language:
        add_filter(Attr("source_language").eq(language) | Attr("target_language").eq(language))
    if from_date:
        add_filter(Attr("created_at").gte(from_date))
    if to_date:
        add_filter(Attr("created_at").lte(to_date))

    scan_kwargs: Dict[str, Any] = {"Limit": limit}
    if filter_expr is not None:
        scan_kwargs["FilterExpression"] = filter_expr

    if cursor:
        try:
            exclusive_start_key = json.loads(base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8"))
            scan_kwargs["ExclusiveStartKey"] = exclusive_start_key
        except Exception:
            pass

    resp = table.scan(**scan_kwargs)
    items = [undecimalize(i) for i in resp.get("Items", [])]

    # Sort descending by created_at
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    next_cursor = None
    if "LastEvaluatedKey" in resp:
        next_cursor = base64.urlsafe_b64encode(json.dumps(resp["LastEvaluatedKey"]).encode("utf-8")).decode("utf-8")

    return items, next_cursor


def list_conversation_jobs(conversation_id: str) -> List[Dict[str, Any]]:
    table = get_dynamodb().Table(JOBS_TABLE_NAME)
    from boto3.dynamodb.conditions import Attr
    resp = table.scan(FilterExpression=Attr("conversation_id").eq(conversation_id))
    items = [undecimalize(i) for i in resp.get("Items", [])]
    items.sort(key=lambda x: x.get("created_at", ""))
    return items


def delete_job_record(job_id: str) -> None:
    table = get_dynamodb().Table(JOBS_TABLE_NAME)
    table.delete_item(Key={"job_id": job_id})


# ----------------------------------------------------------------------
# API Keys
# ----------------------------------------------------------------------
def create_api_key(api_key_hash: str, name: str, scopes: Optional[List[str]] = None) -> Dict[str, Any]:
    table = get_dynamodb().Table(API_KEYS_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "api_key_hash": api_key_hash,
        "name": name,
        "scopes": scopes or ["jobs:write", "jobs:read"],
        "created_at": now,
    }
    table.put_item(Item=decimalize(item))
    return undecimalize(item)


def get_api_key(api_key_hash: str) -> Optional[Dict[str, Any]]:
    table = get_dynamodb().Table(API_KEYS_TABLE_NAME)
    resp = table.get_item(Key={"api_key_hash": api_key_hash})
    item = resp.get("Item")
    return undecimalize(item) if item else None


def list_api_keys() -> List[Dict[str, Any]]:
    table = get_dynamodb().Table(API_KEYS_TABLE_NAME)
    resp = table.scan()
    return [undecimalize(i) for i in resp.get("Items", [])]


def delete_api_key(api_key_hash: str) -> None:
    table = get_dynamodb().Table(API_KEYS_TABLE_NAME)
    table.delete_item(Key={"api_key_hash": api_key_hash})


# ----------------------------------------------------------------------
# S3 Storage
# ----------------------------------------------------------------------
def save_audio(key: str, audio_bytes: bytes, content_type: str = "audio/vnd.wave") -> str:
    s3 = get_s3()
    s3.put_object(
        Bucket=AUDIO_BUCKET_NAME,
        Key=key,
        Body=audio_bytes,
        ContentType=content_type,
    )
    return key


def get_audio(key: str) -> bytes:
    s3 = get_s3()
    resp = s3.get_object(Bucket=AUDIO_BUCKET_NAME, Key=key)
    return resp["Body"].read()


def generate_presigned_get(key: str, expires_in: int = 3600) -> str:
    s3 = get_s3()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": AUDIO_BUCKET_NAME, "Key": key},
        ExpiresIn=expires_in,
    )


def generate_presigned_put(
    key: str,
    content_type: str,
    expires_in: int = 900,
) -> str:
    s3 = get_s3()
    return s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": AUDIO_BUCKET_NAME,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires_in,
    )


def delete_audio(key: str) -> None:
    s3 = get_s3()
    try:
        s3.delete_object(Bucket=AUDIO_BUCKET_NAME, Key=key)
    except Exception:
        pass
