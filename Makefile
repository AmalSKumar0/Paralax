.PHONY: help dev test lint build migrate clean sim registry

help:
	@echo "Paralax Node.js / Vercel targets:"
	@echo "  make dev      - Start local development server (vercel dev)"
	@echo "  make test     - Run Vitest test suite"
	@echo "  make lint     - Run TypeScript type checks"
	@echo "  make build    - Build frontend production bundle"
	@echo "  make sim      - Run ESP32 device simulator"
	@echo "  make migrate  - Run database migrations"
	@echo "  make registry - Validate language registry"

dev:
	npm run dev

test:
	npm test

lint:
	npm run lint

build:
	npm run build

sim:
	node tools/device-sim.mjs

migrate:
	npm run db:migrate

registry:
	npm run registry:check

clean:
	rm -rf dist frontend/dist
