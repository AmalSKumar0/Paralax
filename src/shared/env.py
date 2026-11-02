"""Paralax Environment loader.

Automatically discovers and loads .env files from the project root into os.environ.
Includes both python-dotenv loader and a zero-dependency fallback parser.
"""

import os
from pathlib import Path


def load_env(env_path: str = None) -> bool:
    """Load .env file into os.environ without overwriting existing environment variables."""
    if env_path and os.path.exists(env_path):
        target_path = Path(env_path)
    else:
        # Search parent directories from this file up to project root
        curr = Path(__file__).resolve().parent
        target_path = None
        for p in [curr, curr.parent, curr.parent.parent]:
            candidate = p / ".env"
            if candidate.exists():
                target_path = candidate
                break

    if not target_path or not target_path.exists():
        return False

    # Try python-dotenv first
    try:
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=target_path, override=False)
        return True
    except ImportError:
        pass

    # Lightweight zero-dependency fallback parser
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key and key not in os.environ:
                        os.environ[key] = val
        return True
    except Exception:
        return False


# Auto-execute on import
load_env()
