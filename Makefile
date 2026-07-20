NPM := $(shell command -v npm || command -v /opt/homebrew/bin/npm || command -v /usr/local/bin/npm)
DOCKER := $(shell command -v docker || command -v /Applications/Docker.app/Contents/Resources/bin/docker)
export PATH := $(dir $(NPM)):$(PATH)

DRIZZLE_JOURNAL := api/drizzle/meta/_journal.json
CHART_REPOSITORY_DIR := chart-repository
CHART_REPOSITORY_COMPOSE := $(DOCKER) compose -f $(CHART_REPOSITORY_DIR)/docker-compose.yml

.PHONY: all help install run verify local-setup check-docker postgres services postgres-wait migrate dev climate-venv climate-materialize climate-api climate-api-run climate-openapi docs-install docs-prepare docs-serve docs-build docs-stop identity identity-db identity-wait web web-build web-start web-typecheck web-storybook web-storybook-build api api-build api-start api-test api-typecheck db-generate db-migrate db-check db-seed api-db-generate api-db-migrate api-db-check api-db-seed api-openapi-generate identity-sync identity-restart identity-reset identity-down chart-repo chart-repo-install chart-repo-db chart-repo-db-wait chart-repo-seed chart-repo-stop chart-repo-typecheck chart-repo-build chart-repo-verify solution-repo solution-repo-install solution-repo-db solution-repo-db-wait solution-repo-seed solution-repo-stop solution-repo-typecheck solution-repo-build solution-repo-verify format format-check ensure-drizzle-journal era5-fixture climate-install climate-migrate climate-db-migrate dagster-dev dagster-run

help:
	@printf "\nQuick start (climate pipeline)\n"
	@printf "  make migrate        Start Postgres, run Drizzle + Alembic migrations\n"
	@printf "  make dev            Dagster UI on :3002 with fixture climate asset\n"
	@printf "  make climate-materialize  Materialise one geography partition (PRESET=…)\n"
	@printf "  make climate-api        Python climate predict API on :3210\n"
	@printf "  make climate-openapi    Export docs/openapi/climate.json\n"
	@printf "  make docs-serve         MkDocs site on :8000 (DOCS_PORT=… to override)\n\n"
	@printf "CHART app\n"
	@printf "  make run            Run Next, Python API, Dagster, and legacy API\n"
	@printf "  make api            Run the Fastify API\n"
	@printf "  make web            Run the CHART Next app\n"
	@printf "  make verify         Run API tests, typechecks, builds, and formatting check\n"
	@printf "  make all            Provision local services and run verification checks\n"
	@printf "  make local-setup    Start Docker services, migrate, seed, and sync identity\n"
	@printf "  make services       Start local Postgres and Keycloak\n"
	@printf "  make identity-sync  Re-apply local Keycloak seed users and groups\n"
	@printf "  make identity-restart  Restart Keycloak, preserving data, then sync it\n"
	@printf "  make identity-reset CONFIRM=1  Reset local Keycloak data and seed it\n"
	@printf "  make db-migrate     Apply API Drizzle migrations\n"
	@printf "  make db-seed        Seed API reference data\n"
	@printf "  make api-test       Run API tests\n"
	@printf "  make format-check   Check formatting\n\n"
	@printf "Climate / orchestration\n"
	@printf "  make era5-fixture       Write MVP fixture CSV to data/climate (no Dagster)\n"
	@printf "  make climate-migrate    Run Alembic for climate spine tables\n\n"
	@printf "Chart repository commands\n"
	@printf "  make chart-repo         Start repository Postgres, then run Payload on :3300\n"
	@printf "  make chart-repo-db      Start repository Postgres only\n"
	@printf "  make chart-repo-seed    Seed repository Payload content\n"
	@printf "  make chart-repo-stop    Stop repository Postgres\n"
	@printf "  make chart-repo-verify  Typecheck and build repository service\n\n"

all: local-setup verify

run: local-setup climate-install
	$(MAKE) -j4 api climate-api-run dagster-run web

verify: api-test api-typecheck api-build web-typecheck web-build format-check

local-setup: services postgres-wait identity-wait db-migrate climate-migrate db-seed identity-sync

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

services: identity-db
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

web:
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

api:
	$(NPM) run dev:api

api-build:
	$(NPM) run build:api

api-start:
	$(NPM) run start:api

api-test:
	$(NPM) run test:api

api-typecheck:
	$(NPM) run typecheck:api

ensure-drizzle-journal:
	@mkdir -p api/drizzle/meta
	@if [ ! -f "$(DRIZZLE_JOURNAL)" ]; then printf '{\n  "version": "7",\n  "dialect": "postgresql",\n  "entries": []\n}\n' > "$(DRIZZLE_JOURNAL)"; fi

db-generate: ensure-drizzle-journal
	$(NPM) run db:generate:api

db-migrate:
	DATABASE_URL="$(API_DATABASE_URL)" $(NPM) run db:migrate:api

db-check: ensure-drizzle-journal
	$(NPM) run db:check:api

db-seed:
	$(NPM) run db:seed:api

api-db-generate: db-generate

api-db-migrate: db-migrate

api-db-check: db-check

api-db-seed: db-seed

api-openapi-generate:
	$(NPM) run openapi:generate:api

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
ORCH_DIR := orchestration
BACKEND_DIR := backend
CLIMATE_OUT := data/climate
PYTHON ?= python3.11
UV := $(shell command -v uv 2>/dev/null)
VENV_DIR ?= .venv
VENV_PYTHON := $(abspath $(VENV_DIR))/bin/python
DOCS_PORT ?= 8000
DAGSTER_PORT ?= 3002
CHART_DATABASE_URL ?= postgresql+psycopg://chart:chart@127.0.0.1:5434/chart
API_DATABASE_URL ?= postgres://chart:chart@127.0.0.1:5434/chart

migrate: postgres-wait db-migrate climate-migrate

dev: climate-migrate
	$(MAKE) dagster-run

dagster-run:
	@mkdir -p $(ORCH_DIR)/.dagster_home
	cd $(ORCH_DIR) && ERA5_USE_FIXTURE=1 DATABASE_URL="$(CHART_DATABASE_URL)" \
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
			-e '$(BACKEND_DIR)[dev]' -e '$(ERA5_DIR)[dev]' -e '$(ORCH_DIR)'; \
	else \
		$(VENV_PYTHON) -m pip install \
			-e '$(BACKEND_DIR)[dev]' -e '$(ERA5_DIR)[dev]' -e '$(ORCH_DIR)'; \
	fi

climate-api: climate-migrate
	$(MAKE) climate-api-run

climate-api-run:
	DATABASE_URL="$(CHART_DATABASE_URL)" LBW_SERVICE_URL="$${LBW_SERVICE_URL:-http://127.0.0.1:8000}" \
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
	@if [ -f api/openapi.yaml ]; then \
		cp api/openapi.yaml docs/openapi/fastify.yaml; \
	elif [ ! -f docs/openapi/fastify.yaml ]; then \
		$(MAKE) api-openapi-generate && cp api/openapi.yaml docs/openapi/fastify.yaml; \
	fi
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
	cd $(BACKEND_DIR) && DATABASE_URL="$(CHART_DATABASE_URL)" \
	  $(VENV_PYTHON) -m alembic upgrade head

climate-db-migrate: climate-migrate

dagster-dev: dev
