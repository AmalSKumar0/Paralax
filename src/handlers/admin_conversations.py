"""Admin handler for conversations.

Endpoints:
- GET /v1/admin/conversations?device_id=&from=&to=&cursor=
- GET /v1/admin/conversations/{id}
"""

import json
import os
from typing import Any, Dict, List
from src.shared.db import (
    generate_presigned_get,
    list_conversation_jobs,
    list_jobs,
)
from src.shared.logging import setup_logger

logger = setup_logger("admin_conversations")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("path") or event.get("rawPath") or ""
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}
    conversation_id = path_params.get("id")

    def json_resp(status_code: int, data: Any) -> Dict[str, Any]:
        return {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
            },
            "body": json.dumps(data),
        }

    # Route: GET /v1/admin/conversations/{id}
    if conversation_id:
        jobs = list_conversation_jobs(conversation_id)
        if not jobs:
            return json_resp(404, {"error": {"code": "not_found", "message": f"Conversation {conversation_id} not found"}})

        utterances = []
        for j in jobs:
            input_url = generate_presigned_get(j["audio_input_s3_key"]) if j.get("audio_input_s3_key") else None
            output_url = generate_presigned_get(j["audio_output_s3_key"]) if j.get("audio_output_s3_key") else None
            utterances.append({
                "job_id": j.get("job_id"),
                "created_at": j.get("created_at"),
                "source_language": j.get("source_language"),
                "detected_language": j.get("detected_language"),
                "target_language": j.get("target_language"),
                "transcript": j.get("transcript"),
                "translation": j.get("translation"),
                "timings": j.get("timings"),
                "durations": j.get("durations"),
                "audio_input_url": input_url,
                "audio_output_url": output_url,
                "status": j.get("status"),
            })

        return json_resp(200, {
            "conversation_id": conversation_id,
            "device_id": jobs[0].get("device_id") if jobs else None,
            "utterances": utterances,
            "total_utterances": len(utterances),
        })

    # Route: GET /v1/admin/conversations
    device_id = query_params.get("device_id")
    from_date = query_params.get("from")
    to_date = query_params.get("to")
    cursor = query_params.get("cursor")

    # Fetch jobs and group by conversation_id
    jobs, next_cursor = list_jobs(
        device_id=device_id,
        from_date=from_date,
        to_date=to_date,
        limit=100,
        cursor=cursor,
    )

    conv_map: Dict[str, Dict[str, Any]] = {}
    for j in jobs:
        c_id = j.get("conversation_id")
        if not c_id:
            continue
        if c_id not in conv_map:
            conv_map[c_id] = {
                "conversation_id": c_id,
                "device_id": j.get("device_id"),
                "utterance_count": 0,
                "first_utterance_at": j.get("created_at"),
                "last_utterance_at": j.get("created_at"),
                "languages": set(),
            }
        entry = conv_map[c_id]
        entry["utterance_count"] += 1
        created = j.get("created_at", "")
        if created < entry["first_utterance_at"]:
            entry["first_utterance_at"] = created
        if created > entry["last_utterance_at"]:
            entry["last_utterance_at"] = created
        if j.get("source_language"):
            entry["languages"].add(j["source_language"])
        if j.get("target_language"):
            entry["languages"].add(j["target_language"])

    conversations = []
    for c_id, data in conv_map.items():
        data["languages"] = sorted(list(data["languages"]))
        conversations.append(data)

    conversations.sort(key=lambda x: x["last_utterance_at"], reverse=True)

    return json_resp(200, {
        "conversations": conversations,
        "next_cursor": next_cursor,
    })
