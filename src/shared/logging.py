"""Structured JSON logging with correlation IDs (job_id, device_id)."""

import json
import logging
import os
import sys
import time
from typing import Any, Dict, Optional

_ROOT_LOGGER = None


class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "aws_request_id": getattr(record, "aws_request_id", "-"),
            "job_id": getattr(record, "job_id", "-"),
            "device_id": getattr(record, "device_id", "-"),
            "conversation_id": getattr(record, "conversation_id", "-"),
        }

        # Include custom extra kwargs if present
        if hasattr(record, "extra_data") and isinstance(record.extra_data, dict):
            log_entry.update(record.extra_data)

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, ensure_ascii=False)


def setup_logger(name: str = "paralax", level: Optional[str] = None) -> logging.Logger:
    """Configure and return root logger with structured JSON output."""
    global _ROOT_LOGGER
    logger = logging.getLogger(name)
    log_level = level or os.environ.get("LOG_LEVEL", "INFO").upper()
    logger.setLevel(getattr(logging, log_level, logging.INFO))

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(StructuredJsonFormatter())
        logger.addHandler(handler)
        logger.propagate = False

    return logger


def log_event(
    logger: logging.Logger,
    level: int,
    message: str,
    job_id: str = "-",
    device_id: str = "-",
    conversation_id: str = "-",
    **extra: Any,
) -> None:
    """Helper to log a message with explicit correlation IDs."""
    record = logger.makeRecord(
        logger.name,
        level,
        fn="",
        lno=0,
        msg=message,
        args=(),
        exc_info=extra.pop("exc_info", None),
    )
    record.job_id = job_id
    record.device_id = device_id
    record.conversation_id = conversation_id
    record.extra_data = extra
    logger.handle(record)
