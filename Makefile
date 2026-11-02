.PHONY: help registry test test-coverage lint format build clean

VENV ?= .venv
PYTHON ?= $(VENV)/bin/python3
PYTEST ?= $(VENV)/bin/pytest

help:
	@echo "Available make commands:"
	@echo "  make registry     - Rebuild data/language_registry.json from AWS APIs and static Transcribe tables"
	@echo "  make test         - Run test suite"
	@echo "  make clean        - Clean build artifacts and caches"

registry:
	$(PYTHON) scripts/build_registry.py data/language_registry.json

test:
	$(PYTEST) tests/ -v

clean:
	rm -rf .pytest_cache __pycache__ src/**/__pycache__ tests/__pycache__
