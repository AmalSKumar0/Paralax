"""Path B Task 2: Translation Lambda.

Translates batch transcript into the target language using Amazon Translate.
"""

import json
import os
import time
from typing import Any, Dict
import boto3

from src.shared.db import update_job
from src.shared.languages import get_translate_code, normalize_locale
from src.shared.logging import setup_logger

logger = setup_logger("path_b_translate")


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    job_id = event["job_id"]
    transcript = event.get("transcript", "")
    detected_lang = event.get("detected_language") or event.get("source_language", "en-US")
    target_lang = event.get("target_language", "es-ES")

    update_job(job_id, {"status": "TRANSLATING"})
    t0 = time.perf_counter()

    source_code = get_translate_code(detected_lang)
    target_code = get_translate_code(target_lang)

    region = os.environ.get("AWS_REGION", "us-east-1")
    translate_client = boto3.client("translate", region_name=region)

    resp = translate_client.translate_text(
        Text=transcript,
        SourceLanguageCode=source_code,
        TargetLanguageCode=target_code,
    )
    translated_text = resp.get("TranslatedText", "")

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

    event["translation"] = translated_text
    event["translate_ms"] = elapsed_ms
    return event
