NPM := $(shell command -v npm || command -v /opt/homebrew/bin/npm || command -v /usr/local/bin/npm)
DOCKER := $(shell command -v docker || command -v /Applications/Docker.app/Contents/Resources/bin/docker)
export PATH := $(dir $(NPM)):$(PATH)

CHART_REPOSITORY_DIR := chart-repository
CHART_REPOSITORY_COMPOSE := $(DOCKER) compose -f $(CHART_REPOSITORY_DIR)/docker-compose.yml

.PHONY: all help install run verify python-check local-setup check-docker postgres services mail postgres-wait migrate dev climate-venv climate-materialize climate-api climate-api-run climate-openapi docs-install docs-prepare docs-serve docs-build docs-stop identity identity-db identity-wait web web-build web-start web-typecheck web-storybook web-storybook-build identity-sync identity-test identity-restart identity-reset identity-down chart-repo chart-repo-install chart-repo-db chart-repo-db-wait chart-repo-seed chart-repo-stop chart-repo-typecheck chart-repo-build chart-repo-verify solution-repo solution-repo-install solution-repo-db solution-repo-db-wait solution-repo-seed solution-repo-stop solution-repo-typecheck solution-repo-build solution-repo-verify format format-check era5-fixture climate-install climate-migrate climate-db-migrate dagster-dev dagster-run dagster-run-fixture lbw-check lbw-run bootstrap-token install-hooks

help:
	@printf "\nQuick start (climate pipeline)\n"
	@printf "  make migrate        Start Postgres and run the Python migrations\n"
	@printf "  make dev            Dagster UI on :3002 using live climate sources\n"
	@printf "  make dagster-run-fixture  Dagster with clearly labelled sample data\n"
	@printf "  make climate-materialize  Materialise one geography partition (PRESET=…)\n"
	@printf "  make climate-api        Python climate predict API on :3210\n"
	@printf "  make climate-openapi    Export docs/openapi/climate.json\n"
	@printf "  make docs-serve         MkDocs site on :8001 (DOCS_PORT=… to override)\n\n"
	@printf "CHART app\n"
	@printf "  make run            Run Next, Python, Dagster, and the R prediction model\n"
	@printf "  make web            Run the canonical CHART web app on :3100\n"
	@printf "  make verify         Run API tests, typechecks, builds, and formatting check\n"
	@printf "  make all            Provision local services and run verification checks\n"
	@printf "  make local-setup    Start Docker services, migrate, seed, and sync identity\n"
	@printf "  make services       Start local Postgres and Keycloak\n"
	@printf "  make mail           Start local Mailpit (SMTP :1025, inbox :8025)\n"
	@printf "  make bootstrap-token  Ensure CHART_BOOTSTRAP_TOKEN exists in web/.env.local\n"
	@printf "  make install-hooks    Enable local pre-commit hooks (OpenAPI regen)\n"
	@printf "  make identity-sync  Re-apply local Keycloak seed users and groups\n"
	@printf "  make identity-test  Test Keycloak SSO and redirect configuration\n"
	@printf "  make identity-restart  Restart Keycloak, preserving data, then sync it\n"
	@printf "  make identity-reset CONFIRM=1  Reset local Keycloak data and seed it\n"
	@printf "  make migrate        Apply all CHART database migrations\n"
	@printf "  make format-check   Check formatting\n\n"
	@printf "Climate / orchestration\n"
	@printf "  make lbw-run            Run the R prediction model on :8000\n"
	@printf "  make era5-fixture       Write MVP fixture CSV to data/climate (no Dagster)\n"
	@printf "  make climate-migrate    Run Alembic for climate spine tables\n\n"
	@printf "Chart repository commands\n"
	@printf "  make chart-repo         Start repository Postgres, then run Payload on :3300\n"
	@printf "  make chart-repo-db      Start repository Postgres only\n"
	@printf "  make chart-repo-seed    Seed repository Payload content\n"
	@printf "  make chart-repo-stop    Stop repository Postgres\n"
	@printf "  make chart-repo-verify  Typecheck and build repository service\n\n"

all: local-setup verify

run: local-setup climate-install lbw-check
	$(MAKE) -j4 lbw-run climate-api-run dagster-run web

verify: climate-install identity-test python-check web-typecheck web-build format-check
	$(VENV_PYTHON) -m pytest backend/tests orchestration/tests pipelines/boundaries/tests pipelines/era5_heat/tests pipelines/seasonal_c3s/tests pipelines/isimip_projection/tests pipelines/models/lbw/tests -q

python-check:
	$(VENV_PYTHON) -m ruff check backend orchestration pipelines/boundaries pipelines/era5_heat/src pipelines/era5_heat/tests pipelines/seasonal_c3s pipelines/isimip_projection pipelines/models/lbw/model_release.py pipelines/models/lbw/tests
	$(VENV_PYTHON) -m black --check backend orchestration pipelines/boundaries pipelines/seasonal_c3s pipelines/isimip_projection pipelines/era5_heat/src/era5_heat/__init__.py pipelines/era5_heat/src/era5_heat/aggregate.py pipelines/era5_heat/tests/test_aggregate.py pipelines/models/lbw/model_release.py pipelines/models/lbw/tests
	$(VENV_PYTHON) -m mypy backend/chart orchestration/src pipelines/boundaries/src pipelines/era5_heat/src pipelines/seasonal_c3s/src pipelines/isimip_projection/src pipelines/models/lbw/model_release.py --ignore-missing-imports --no-error-summary

local-setup: services postgres-wait identity-wait climate-migrate identity-sync

check-docker:
	@if [ -z "$(DOCKER)" ]; then printf "Docker CLI not found. Start Docker Desktop or install docker CLI.\n"; exit 1; fi

postgres: check-docker
	@if docker inspect chart-postgres >/dev/null 2>&1; then \
		host_port=$$(docker inspect chart-postgres \
			--format '{{(index (index .HostConfig.PortBindings "5432/tcp") 0).HostPort}}' \
			2>/dev/null || true); \
		if [ "$$host_port" != "5434" ]; then \
			printf "Recreating chart-postgres on host port 5434 (was %s)\n" "$${host_port:-unknown}"; \
			docker rm -f chart-postgres; \
		fi; \
	fi
	$(DOCKER) compose -f infra/docker-compose.yml up -d chart-postgres

services: identity-db mail
	@port_owner=$$(docker ps --filter publish=8080 --format '{{.Names}}'); \
		if [ -n "$$port_owner" ] && [ "$$port_owner" != "chart-keycloak" ]; then \
			printf "Port 8080 is already used by %s. Stop it before starting CHART Keycloak.\n" "$$port_owner"; \
			exit 1; \
		fi
	@if docker inspect chart-keycloak >/dev/null 2>&1; then \
		project=$$(docker inspect chart-keycloak --format '{{index .Config.Labels "com.docker.compose.project"}}'); \
		service=$$(docker inspect chart-keycloak --format '{{index .Config.Labels "com.docker.compose.service"}}'); \
		if [ "$$project" != "infra" ] || [ "$$service" != "chart-keycloak" ]; then \
			docker rm -f chart-keycloak >/dev/null; \
		fi; \
	fi
	$(DOCKER) compose -f infra/docker-compose.yml up -d chart-keycloak

mail: check-docker
	$(DOCKER) compose -f infra/docker-compose.yml up -d chart-mailpit

postgres-wait: postgres
	@printf "Waiting for chart Postgres on 127.0.0.1:5434"
	@for attempt in $$(seq 1 60); do \
		if docker inspect -f '{{.State.Running}}' chart-postgres 2>/dev/null | grep -q true \
		   && docker exec chart-postgres pg_isready -U chart -d chart >/dev/null 2>&1; then \
			printf " ready\n"; exit 0; \
		fi; \
		printf "."; sleep 1; \
	done; \
	printf "\nTimed out waiting for chart Postgres on 127.0.0.1:5434\n"; \
	printf "Try: make services\n"; \
	exit 1

identity-db: postgres-wait
	$(DOCKER) exec chart-postgres psql -v ON_ERROR_STOP=1 -U chart -d postgres \
		-f /docker-entrypoint-initdb.d/10-keycloak.sql >/dev/null

identity: services

install:
	$(NPM) install

install-hooks:
	git config core.hooksPath .githooks
	chmod +x .githooks/*
	@echo "Hooks installed. Backend commits will now regenerate docs/openapi/climate.json."

WEB_ENV_LOCAL := web/.env.local

bootstrap-token:
	@if [ ! -f "$(WEB_ENV_LOCAL)" ] || ! grep -q "^CHART_BOOTSTRAP_TOKEN=" "$(WEB_ENV_LOCAL)"; then \
		if command -v openssl >/dev/null 2>&1; then \
			token=$$(openssl rand -hex 32); \
		else \
			token=$$(xxd -l 32 -p /dev/urandom | tr -d '\n'); \
		fi; \
		mkdir -p web; \
		touch "$(WEB_ENV_LOCAL)"; \
		printf "CHART_BOOTSTRAP_TOKEN=%s\n" "$$token" >> "$(WEB_ENV_LOCAL)"; \
		printf "Generated CHART_BOOTSTRAP_TOKEN and appended to %s\n" "$(WEB_ENV_LOCAL)"; \
	fi

web: bootstrap-token
	$(NPM) run dev:web

web-build:
	$(NPM) run build:web

web-start:
	$(NPM) run start:web

web-typecheck:
	$(NPM) run typecheck:web

web-storybook:
	$(NPM) run storybook:web

web-storybook-build:
	$(NPM) run build-storybook:web

identity-wait: services
	@printf "Waiting for local Keycloak"
	@for attempt in $$(seq 1 60); do \
		if curl -fsS http://127.0.0.1:8080/realms/chart/.well-known/openid-configuration >/dev/null 2>&1; then \
			printf " ready\n"; \
			exit 0; \
		fi; \
		printf "."; \
		sleep 1; \
	done; \
	printf "\nTimed out waiting for local Keycloak on http://127.0.0.1:8080\n"; \
	exit 1

identity-sync: identity-wait
	$(NPM) run identity:sync

identity-test:
	$(NPM) run identity:test

identity-restart: check-docker
	$(MAKE) services
	$(DOCKER) restart chart-keycloak
	$(MAKE) identity-wait
	$(MAKE) identity-sync

identity-reset: check-docker
	@if [ "$(CONFIRM)" != "1" ]; then \
		printf "This deletes only the local Keycloak database. Re-run with: make identity-reset CONFIRM=1\n"; \
		exit 2; \
	fi
	@port_owner=$$(docker ps --filter publish=8080 --format '{{.Names}}'); \
		if [ -n "$$port_owner" ] && [ "$$port_owner" != "chart-keycloak" ]; then \
			printf "Port 8080 is already used by %s. Stop it before resetting CHART Keycloak.\n" "$$port_owner"; \
			exit 1; \
		fi
	$(MAKE) postgres-wait
	@docker rm -f chart-keycloak >/dev/null 2>&1 || true
	$(DOCKER) exec chart-postgres psql -v ON_ERROR_STOP=1 -U chart -d postgres \
		-c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'chart_keycloak' AND pid <> pg_backend_pid();" \
		-c "DROP DATABASE IF EXISTS chart_keycloak;" \
		-c "DROP ROLE IF EXISTS chart_keycloak;"
	$(MAKE) services
	$(MAKE) identity-wait
	$(MAKE) identity-sync
identity-down: check-docker
	@if docker inspect chart-keycloak >/dev/null 2>&1; then docker stop chart-keycloak; fi

chart-repo: chart-repo-install chart-repo-db chart-repo-db-wait
	cd $(CHART_REPOSITORY_DIR) && $(NPM) run dev

chart-repo-install:
	cd $(CHART_REPOSITORY_DIR) && $(NPM) install

chart-repo-db: check-docker
	$(CHART_REPOSITORY_COMPOSE) up -d chart-repository-postgres

chart-repo-db-wait:
	@printf "Waiting for chart repository Postgres"
	@for attempt in $$(seq 1 60); do \
		if $(CHART_REPOSITORY_COMPOSE) exec -T chart-repository-postgres pg_isready -U chart_repository -d chart_repository >/dev/null 2>&1; then \
			printf " ready\n"; \
			exit 0; \
		fi; \
		printf "."; \
		sleep 1; \
	done; \
	printf "\nTimed out waiting for chart repository Postgres on 127.0.0.1:5433\n"; \
	exit 1

chart-repo-seed: chart-repo-db chart-repo-db-wait
	cd $(CHART_REPOSITORY_DIR) && $(NPM) run seed

chart-repo-stop: check-docker
	$(CHART_REPOSITORY_COMPOSE) stop

chart-repo-typecheck:
	cd $(CHART_REPOSITORY_DIR) && $(NPM) run typecheck

chart-repo-build:
	cd $(CHART_REPOSITORY_DIR) && $(NPM) run build

chart-repo-verify: chart-repo-typecheck chart-repo-build

solution-repo: chart-repo
solution-repo-install: chart-repo-install
solution-repo-db: chart-repo-db
solution-repo-db-wait: chart-repo-db-wait
solution-repo-seed: chart-repo-seed
solution-repo-stop: chart-repo-stop
solution-repo-typecheck: chart-repo-typecheck
solution-repo-build: chart-repo-build
solution-repo-verify: chart-repo-verify

format:
	$(NPM) run format

format-check:
	$(NPM) run format:check

ERA5_DIR := pipelines/era5_heat
SEASONAL_DIR := pipelines/seasonal_c3s
PROJECTION_DIR := pipelines/isimip_projection
BOUNDARY_DIR := pipelines/boundaries
LBW_DIR := pipelines/models/lbw
ORCH_DIR := orchestration
BACKEND_DIR := backend
CLIMATE_OUT := data/climate
PYTHON ?= python3.11
UV := $(shell command -v uv 2>/dev/null)
VENV_DIR ?= .venv
VENV_PYTHON := $(abspath $(VENV_DIR))/bin/python
DOCS_PORT ?= 8001
LBW_PORT ?= 8000
LBW_MODEL_RELEASE_MANIFEST ?= $(abspath $(LBW_DIR)/model-release.example.json)
LBW_MODEL_DIVISION ?= $(abspath $(LBW_DIR)/model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds)
LBW_MODEL_STATE ?= $(abspath $(LBW_DIR)/model/MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds)
DAGSTER_PORT ?= 3002
CHART_DATABASE_URL ?= postgresql+psycopg://chart:chart@127.0.0.1:5434/chart
migrate: climate-migrate

dev: climate-migrate
	$(MAKE) dagster-run

lbw-check:
	@if ! command -v Rscript >/dev/null 2>&1; then \
		printf "Rscript is required for the LBW prediction model.\n"; \
		exit 1; \
	fi
	@$(PYTHON) $(LBW_DIR)/model_release.py \
		--manifest "$(LBW_MODEL_RELEASE_MANIFEST)" \
		--division "$(LBW_MODEL_DIVISION)" \
		--state "$(LBW_MODEL_STATE)"
	@Rscript $(LBW_DIR)/tests/test_serialization.R

lbw-run: lbw-check
	@health=$$(curl -fsS "http://127.0.0.1:$(LBW_PORT)/health" 2>/dev/null || true); \
	if printf "%s" "$$health" | grep -q '"region"[[:space:]]*:[[:space:]]*"MP"'; then \
		printf "LBW prediction model is already ready on http://127.0.0.1:$(LBW_PORT)\n"; \
		exit 0; \
	fi; \
	if lsof -ti :"$(LBW_PORT)" >/dev/null 2>&1; then \
		printf "Port %s is in use by something other than the LBW prediction model.\n" "$(LBW_PORT)"; \
		exit 1; \
	fi
	@printf "LBW prediction model: http://127.0.0.1:$(LBW_PORT)\n"
	cd $(LBW_DIR) && \
		PORT="$(LBW_PORT)" \
		PYTHON="$(PYTHON)" \
		LBW_MODEL_RELEASE_MANIFEST="$(LBW_MODEL_RELEASE_MANIFEST)" \
		LBW_MODEL_DIVISION="$(LBW_MODEL_DIVISION)" \
		LBW_MODEL_STATE="$(LBW_MODEL_STATE)" \
		bash run_api.sh

dagster-run:
	@mkdir -p $(ORCH_DIR)/.dagster_home
	cd $(ORCH_DIR) && DATABASE_URL="$(CHART_DATABASE_URL)" \
	  LBW_SERVICE_URL="$${LBW_SERVICE_URL:-http://127.0.0.1:8000}" \
	  DAGSTER_HOME=$(CURDIR)/$(ORCH_DIR) \
	  $(VENV_PYTHON) -m dagster dev -p "$(DAGSTER_PORT)" -m chart_pipeline.definitions

dagster-run-fixture:
	@mkdir -p $(ORCH_DIR)/.dagster_home
	cd $(ORCH_DIR) && CLIMATE_USE_FIXTURE=1 DATABASE_URL="$(CHART_DATABASE_URL)" \
	  LBW_SERVICE_URL="$${LBW_SERVICE_URL:-http://127.0.0.1:8000}" \
	  DAGSTER_HOME=$(CURDIR)/$(ORCH_DIR) \
	  $(VENV_PYTHON) -m dagster dev -p "$(DAGSTER_PORT)" -m chart_pipeline.definitions

climate-materialize: climate-migrate
	cd $(ORCH_DIR) && ERA5_USE_FIXTURE=1 DATABASE_URL="$(CHART_DATABASE_URL)" \
	  $(VENV_PYTHON) -m dagster asset materialize -m chart_pipeline.definitions \
	  --select era5_observed_climate --partition "$${PRESET:-madhya-pradesh}"

era5-fixture: climate-install
	@mkdir -p "$(CLIMATE_OUT)"
	$(VENV_PYTHON) -c 'from pathlib import Path; from era5_heat import fixture_demo; from era5_heat.io import output_paths, write_json, write_table; df, meta = fixture_demo("madhya-pradesh", years=5, end_year=2024); outdir = Path("$(CLIMATE_OUT)"); table, meta_path = output_paths(outdir, "madhya-pradesh", meta["window"]["start_year"], meta["window"]["end_year"], "csv"); write_table(df, table, "csv"); write_json(meta, meta_path); print(table); print(meta_path)'

climate-venv:
	@if [ ! -x "$(VENV_PYTHON)" ]; then \
		if [ -n "$(UV)" ]; then \
			$(UV) venv --python "$(PYTHON)" "$(VENV_DIR)"; \
		else \
			$(PYTHON) -m venv "$(VENV_DIR)"; \
		fi; \
	fi

climate-install: climate-venv
	@if [ -n "$(UV)" ]; then \
		$(UV) pip install --python "$(VENV_PYTHON)" \
			-e '$(BACKEND_DIR)[dev]' -e '$(ERA5_DIR)[dev]' \
			-e '$(SEASONAL_DIR)[dev]' -e '$(PROJECTION_DIR)[dev]' \
			-e '$(BOUNDARY_DIR)[dev]' -e '$(ORCH_DIR)'; \
	else \
		$(VENV_PYTHON) -m pip install \
			-e '$(BACKEND_DIR)[dev]' -e '$(ERA5_DIR)[dev]' \
			-e '$(SEASONAL_DIR)[dev]' -e '$(PROJECTION_DIR)[dev]' \
			-e '$(BOUNDARY_DIR)[dev]' -e '$(ORCH_DIR)'; \
	fi

climate-api: climate-migrate
	$(MAKE) climate-api-run

climate-api-run: bootstrap-token
	@token=$$(sed -n 's/^CHART_BOOTSTRAP_TOKEN=//p' "$(WEB_ENV_LOCAL)" | head -1); \
	DATABASE_URL="$(CHART_DATABASE_URL)" \
	  LBW_SERVICE_URL="$${LBW_SERVICE_URL:-http://127.0.0.1:8000}" \
	  CHART_BOOTSTRAP_TOKEN="$$token" \
	  $(VENV_PYTHON) -m chart

climate-openapi: climate-install
	@mkdir -p docs/openapi
	$(VENV_PYTHON) -m chart.api.export_openapi --output docs/openapi/climate.json

docs-install: climate-venv
	@if [ -n "$(UV)" ]; then \
		$(UV) pip install --python "$(VENV_PYTHON)" -r docs/requirements.txt; \
	else \
		$(VENV_PYTHON) -m pip install -r docs/requirements.txt; \
	fi

docs-prepare:
	@mkdir -p docs/openapi
	@if $(VENV_PYTHON) -c "import chart.api.export_openapi" 2>/dev/null; then \
		$(VENV_PYTHON) -m chart.api.export_openapi --output docs/openapi/climate.json; \
	elif [ ! -f docs/openapi/climate.json ]; then \
		$(MAKE) climate-openapi; \
	else \
		printf "docs: using checked-in docs/openapi/climate.json (run make climate-openapi to refresh)\n"; \
	fi

docs-serve: docs-prepare
	@if lsof -ti :$(DOCS_PORT) >/dev/null 2>&1; then \
		printf "Port $(DOCS_PORT) is already in use. Run: make docs-stop\n"; \
		printf "Or use another port: DOCS_PORT=8001 make docs-serve\n"; \
		exit 1; \
	fi
	@printf "MkDocs: http://127.0.0.1:$(DOCS_PORT)\n"
	@if [ -n "$(UV)" ]; then \
		$(UV) run \
		  --with mkdocs-material \
		  --with mkdocs-swagger-ui-tag \
		  --with pymdown-extensions \
		  mkdocs serve -a 127.0.0.1:$(DOCS_PORT); \
	else \
		$(MAKE) docs-install && $(VENV_PYTHON) -m mkdocs serve -a 127.0.0.1:$(DOCS_PORT); \
	fi

docs-stop:
	@if lsof -ti :$(DOCS_PORT) >/dev/null 2>&1; then \
		lsof -ti :$(DOCS_PORT) | xargs kill; \
		printf "Stopped MkDocs on port $(DOCS_PORT)\n"; \
	else \
		printf "No server listening on port $(DOCS_PORT)\n"; \
	fi

docs-build: docs-prepare
	@if [ -n "$(UV)" ]; then \
		$(UV) run \
		  --with mkdocs-material \
		  --with mkdocs-swagger-ui-tag \
		  --with pymdown-extensions \
		  mkdocs build --strict; \
	else \
		$(MAKE) docs-install && $(VENV_PYTHON) -m mkdocs build --strict; \
	fi

climate-migrate: climate-install postgres-wait
	PYTHON_BIN="$(VENV_PYTHON)" DATABASE_URL="$(CHART_DATABASE_URL)" \
	  backend/scripts/migrate.sh

climate-db-migrate: climate-migrate

dagster-dev: dev
