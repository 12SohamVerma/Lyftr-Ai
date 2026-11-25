COMPOSE ?= docker compose
PYTHON_IMAGE ?= python:3.12-slim

.DEFAULT_GOAL := help
.PHONY: help up down build logs ps restart test test-local clean

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-11s %s\n", $$1, $$2}'

up: ## Build and start backend (:8000) and frontend (:3000)
	@test -f .env || echo "WARNING: no .env found - copy .env.example to .env and add at least two LLM_API_KEYS."
	$(COMPOSE) up --build -d
	@echo ""
	@echo "  Frontend: http://localhost:3000"
	@echo "  Backend:  http://localhost:8000/health"

down: ## Stop the stack (keeps the SQLite volume)
	$(COMPOSE) down

build: ## Build both images
	$(COMPOSE) build

logs: ## Follow logs of both services
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

restart: ## Restart the containers (data survives)
	$(COMPOSE) restart

test: ## Run the backend test suite in a throwaway Python container (no API keys or credits needed)
	docker run --rm -v "$(CURDIR)/backend:/src:ro" -w /tmp $(PYTHON_IMAGE) sh -c \
		"mkdir -p /tmp/backend && cp -r /src/app /src/tests /src/requirements.txt /src/requirements-dev.txt /src/pytest.ini /tmp/backend/ \
		&& cd /tmp/backend && pip install -q --root-user-action=ignore -r requirements-dev.txt && python -m pytest -v"

test-local: ## Run the backend tests with a local Python 3.11+ (backend/.venv)
	cd backend && python -m pytest -v

clean: ## Stop the stack AND delete the SQLite/cache volume (destructive)
	$(COMPOSE) down -v
