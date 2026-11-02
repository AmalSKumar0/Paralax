"""Admin stats handler for operational metrics and performance analytics.

Computes:
- Counts by status and kind
- Jobs per day over last 30 days
- Failure rate
- Devices online vs total
- Top language pairs
- Total audio minutes processed
- p50 and p95 latencies (total, transcribe, translate, synthesize) over last 24h
  (computed over a capped query of max 500 recent jobs)
"""

import json
import math
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from src.handlers.admin_devices import is_device_online
from src.shared.db import get_dynamodb, list_devices, JOBS_TABLE_NAME
from src.shared.logging import setup_logger

logger = setup_logger("admin_stats")

# Documented query cap for real-time percentiles calculation
STATS_QUERY_CAP = 500


def calculate_percentile(values: List[float], p: float) -> float:
    """Calculate p-th percentile (0.0 - 100.0) from a list of numerical values."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return round(sorted_vals[int(k)], 2)
    d0 = sorted_vals[int(f)] * (c - k)
    d1 = sorted_vals[int(c)] * (k - f)
    return round(d0 + d1, 2)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    # 1. Fetch devices and count online/total
    devices = list_devices()
    total_devices = len(devices)
    online_devices = sum(1 for d in devices if is_device_online(d))

    # 2. Query jobs capped at STATS_QUERY_CAP
    table = get_dynamodb().Table(JOBS_TABLE_NAME)
    resp = table.scan(Limit=STATS_QUERY_CAP)
    jobs = resp.get("Items", [])

    # Metrics aggregation
    counts_by_status = Counter()
    counts_by_kind = Counter()
    jobs_by_day = defaultdict(int)
    language_pairs = Counter()
    total_audio_sec = 0.0

    now_utc = datetime.now(timezone.utc)
    twenty_four_hours_ago = (now_utc - timedelta(hours=24)).isoformat()
    thirty_days_ago = (now_utc - timedelta(days=30)).strftime("%Y-%m-%d")

    total_latencies_24h = []
    transcribe_latencies_24h = []
    translate_latencies_24h = []
    synthesize_latencies_24h = []

    for j in jobs:
        status = j.get("status", "UNKNOWN")
        kind = j.get("kind", "utterance")
        counts_by_status[status] += 1
        counts_by_kind[kind] += 1

        # Date bucketing for 30-day jobs
        created_at = j.get("created_at", "")
        day_str = created_at[:10] if len(created_at) >= 10 else ""
        if day_str and day_str >= thirty_days_ago:
            jobs_by_day[day_str] += 1

        # Language pair
        src = j.get("source_language") or j.get("detected_language") or "unknown"
        tgt = j.get("target_language") or "unknown"
        language_pairs[f"{src}->{tgt}"] += 1

        # Audio duration
        durations = j.get("durations", {})
        if isinstance(durations, dict):
            total_audio_sec += float(durations.get("audio_input_sec", 0.0))

        # Latencies in last 24h
        if created_at >= twenty_four_hours_ago:
            timings = j.get("timings", {})
            if isinstance(timings, dict):
                tot = timings.get("total_ms")
                if tot is not None:
                    total_latencies_24h.append(float(tot))
                tr = timings.get("transcribe_ms")
                if tr is not None:
                    transcribe_latencies_24h.append(float(tr))
                tl = timings.get("translate_ms")
                if tl is not None:
                    translate_latencies_24h.append(float(tl))
                sy = timings.get("synthesize_ms")
                if sy is not None:
                    synthesize_latencies_24h.append(float(sy))

    total_jobs_scanned = len(jobs)
    failed_count = counts_by_status.get("FAILED", 0)
    failure_rate = round(failed_count / max(1, total_jobs_scanned), 4)

    # Top language pairs
    top_pairs = [{"pair": pair, "count": count} for pair, count in language_pairs.most_common(5)]

    # Format 30-day jobs list
    sorted_days = sorted(jobs_by_day.keys())
    jobs_per_day = [{"date": d, "count": jobs_by_day[d]} for d in sorted_days]

    stats_payload = {
        "metadata": {
            "query_cap": STATS_QUERY_CAP,
            "jobs_evaluated": total_jobs_scanned,
            "window_hours_latency": 24,
            "window_days_jobs": 30,
        },
        "devices": {
            "online": online_devices,
            "total": total_devices,
        },
        "jobs": {
            "total": total_jobs_scanned,
            "counts_by_status": dict(counts_by_status),
            "counts_by_kind": dict(counts_by_kind),
            "failure_rate": failure_rate,
            "jobs_per_day_30d": jobs_per_day,
        },
        "audio": {
            "total_audio_minutes": round(total_audio_sec / 60.0, 2),
            "top_language_pairs": top_pairs,
        },
        "latencies_24h_ms": {
            "total": {
                "p50": calculate_percentile(total_latencies_24h, 50.0),
                "p95": calculate_percentile(total_latencies_24h, 95.0),
                "samples": len(total_latencies_24h),
            },
            "transcribe": {
                "p50": calculate_percentile(transcribe_latencies_24h, 50.0),
                "p95": calculate_percentile(transcribe_latencies_24h, 95.0),
                "samples": len(transcribe_latencies_24h),
            },
            "translate": {
                "p50": calculate_percentile(translate_latencies_24h, 50.0),
                "p95": calculate_percentile(translate_latencies_24h, 95.0),
                "samples": len(translate_latencies_24h),
            },
            "synthesize": {
                "p50": calculate_percentile(synthesize_latencies_24h, 50.0),
                "p95": calculate_percentile(synthesize_latencies_24h, 95.0),
                "samples": len(synthesize_latencies_24h),
            },
        },
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("CORS_ALLOW_ORIGIN", "*"),
        },
        "body": json.dumps(stats_payload),
    }
