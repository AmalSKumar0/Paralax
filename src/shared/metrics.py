"""CloudWatch Embedded Metric Format (EMF) emitter.

Emits structured CloudWatch metrics synchronously via stdout logs with zero HTTP latency.
Supports:
- Per-stage latency (transcribe_ms, translate_ms, synthesize_ms, total_ms)
- Failures metric
- Dimensions: Environment, LanguagePair, DeviceId, Kind
"""

import json
import os
import sys
import time
from typing import Any, Dict, List, Optional


def emit_emf_metrics(
    metric_namespace: str = "Paralax/VoiceTranslator",
    dimensions: Optional[List[Dict[str, str]]] = None,
    metrics: Optional[Dict[str, float]] = None,
    properties: Optional[Dict[str, Any]] = None,
) -> None:
    """Print an EMF-compliant JSON line to stdout.
    
    CloudWatch Logs automatically extracts these metrics and publishes them to CloudWatch Metrics.
    """
    if metrics is None:
        metrics = {}
    if properties is None:
        properties = {}
    if dimensions is None:
        dimensions = [{"Environment": os.environ.get("ENVIRONMENT", "dev")}]

    dim_keys = list(dimensions[0].keys())

    emf_metric_definitions = []
    for m_name, m_val in metrics.items():
        unit = "Milliseconds" if m_name.endswith("_ms") else ("Count" if m_name in ["Success", "Failure", "RequestCount"] else "None")
        emf_metric_definitions.append({"Name": m_name, "Unit": unit})

    timestamp_ms = int(time.time() * 1000)

    emf_payload: Dict[str, Any] = {
        "_aws": {
            "Timestamp": timestamp_ms,
            "CloudWatchMetrics": [
                {
                    "Namespace": metric_namespace,
                    "Dimensions": [dim_keys],
                    "Metrics": emf_metric_definitions,
                }
            ],
        }
    }

    # Add dimension key-values at root
    for dim in dimensions:
        emf_payload.update(dim)

    # Add metric values at root
    for m_name, m_val in metrics.items():
        emf_payload[m_name] = m_val

    # Add custom metadata properties at root
    emf_payload.update(properties)

    # Output as single JSON line
    sys.stdout.write(json.dumps(emf_payload) + "\n")
    sys.stdout.flush()


def emit_translation_metrics(
    device_id: str,
    source_language: str,
    target_language: str,
    transcribe_ms: float,
    translate_ms: float,
    synthesize_ms: float,
    total_ms: float,
    is_success: bool = True,
    kind: str = "utterance",
    error_code: Optional[str] = None,
) -> None:
    """Convenience helper for translation pipeline stage metrics."""
    env = os.environ.get("ENVIRONMENT", "dev")
    pair = f"{source_language}->{target_language}"

    dimensions = [
        {
            "Environment": env,
            "LanguagePair": pair,
            "Kind": kind,
        }
    ]

    metrics = {
        "TranscribeLatency": transcribe_ms,
        "TranslateLatency": translate_ms,
        "SynthesizeLatency": synthesize_ms,
        "TotalLatency": total_ms,
        "Success": 1.0 if is_success else 0.0,
        "Failure": 0.0 if is_success else 1.0,
        "RequestCount": 1.0,
    }

    properties = {
        "DeviceId": device_id,
        "ErrorCode": error_code or "None",
        "SourceLanguage": source_language,
        "TargetLanguage": target_language,
    }

    emit_emf_metrics(
        metric_namespace=os.environ.get("METRICS_NAMESPACE", "Paralax/VoiceTranslator"),
        dimensions=dimensions,
        metrics=metrics,
        properties=properties,
    )
