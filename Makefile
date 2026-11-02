.PHONY: help registry test test-coverage lint format build clean serve sim

VENV ?= .venv
PYTHON ?= $(VENV)/bin/python3
PYTEST ?= $(VENV)/bin/pytest

help:
	@echo "Available make commands:"
	@echo "  make serve        - Start local IoT translation backend server (0.0.0.0:8000)"
	@echo "  make sim          - Run ESP32 device hardware simulator against local server"
	@echo "  make test         - Run full test suite"
	@echo "  make registry     - Rebuild data/language_registry.json"
	@echo "  make clean        - Clean build artifacts and caches"

serve:
	$(PYTHON) tools/local_server.py

sim:
	$(PYTHON) tools/device_sim.py --api-url http://localhost:8000 --device-key dev_secret_key_12345

registry:
	$(PYTHON) scripts/build_registry.py data/language_registry.json

test:
	$(PYTEST) tests/ -v

clean:
	rm -rf .pytest_cache __pycache__ src/**/__pycache__ tests/__pycache__

