NPM := $(shell command -v npm || command -v /opt/homebrew/bin/npm || command -v /usr/local/bin/npm)
DOCKER := $(shell command -v docker || command -v /Applications/Docker.app/Contents/Resources/bin/docker)
export PATH := $(dir $(NPM)):$(PATH)

DRIZZLE_JOURNAL := api/drizzle/meta/_journal.json
SOLUTION_REPOSITORY_DIR := solution-repository
SOLUTION_REPOSITORY_COMPOSE := $(DOCKER) compose -f $(SOLUTION_REPOSITORY_DIR)/docker-compose.yml

.PHONY: all help install run verify local-setup check-docker identity-wait web web-build web-start web-typecheck web-storybook web-storybook-build api api-build api-start api-test api-typecheck db-generate db-migrate db-check db-seed api-db-generate api-db-migrate api-db-check api-db-seed api-openapi-generate identity identity-sync identity-restart identity-down solution-repo solution-repo-install solution-repo-db solution-repo-db-wait solution-repo-seed solution-repo-stop solution-repo-typecheck solution-repo-build solution-repo-verify format format-check ensure-drizzle-journal

help:
	@printf "\nCHART commands\n"
	@printf "  make all            Provision local services and run verification checks\n"
	@printf "  make run            Provision local services, then run API and web app\n"
	@printf "  make verify         Run API tests, typechecks, builds, and formatting check\n"
	@printf "  make local-setup    Start Docker services, migrate, seed, and sync identity\n"
	@printf "  make identity       Start local Postgres and Keycloak\n"
	@printf "  make identity-sync  Re-apply local Keycloak seed users and groups\n"
	@printf "  make identity-restart Restart Keycloak and re-apply seed users/groups\n"
	@printf "  make web            Run the CHART Next app\n"
	@printf "  make api            Run the Fastify API\n"
	@printf "  make db-generate    Generate a Drizzle migration from api/src/db/schema.ts\n"
	@printf "  make db-check       Check Drizzle migration consistency\n"
	@printf "  make db-migrate     Apply API migrations to the configured database\n"
	@printf "  make db-seed        Seed API reference data\n"
	@printf "  make api-test       Run API tests\n"
	@printf "  make web-typecheck  Typecheck the web app\n"
	@printf "  make format-check   Check formatting\n\n"
	@printf "Solution repository commands\n"
	@printf "  make solution-repo         Start repository Postgres, then run Payload on :3300\n"
	@printf "  make solution-repo-db      Start repository Postgres only\n"
	@printf "  make solution-repo-seed    Seed repository Payload content\n"
	@printf "  make solution-repo-stop    Stop repository Postgres\n"
	@printf "  make solution-repo-verify  Typecheck and build repository service\n\n"

all: local-setup verify

run: local-setup
	$(MAKE) -j2 api web

verify: api-test api-typecheck api-build web-typecheck web-build format-check

local-setup: identity identity-wait db-migrate db-seed identity-sync

check-docker:
	@if [ -z "$(DOCKER)" ]; then printf "Docker CLI not found. Start Docker Desktop or install docker CLI.\n"; exit 1; fi

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
	$(NPM) run db:migrate:api

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

identity: check-docker
	$(DOCKER) compose up -d chart-postgres chart-keycloak-postgres chart-keycloak

identity-wait:
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

identity-sync:
	$(NPM) run identity:sync

identity-restart: check-docker
	$(DOCKER) compose restart chart-keycloak
	$(MAKE) identity-wait
	$(MAKE) identity-sync

identity-down: check-docker
	$(DOCKER) compose stop chart-keycloak

solution-repo: solution-repo-install solution-repo-db solution-repo-db-wait
	cd $(SOLUTION_REPOSITORY_DIR) && $(NPM) run dev

solution-repo-install:
	cd $(SOLUTION_REPOSITORY_DIR) && $(NPM) install

solution-repo-db: check-docker
	$(SOLUTION_REPOSITORY_COMPOSE) up -d solution-repository-postgres

solution-repo-db-wait:
	@printf "Waiting for solution repository Postgres"
	@for attempt in $$(seq 1 60); do \
		if $(SOLUTION_REPOSITORY_COMPOSE) exec -T solution-repository-postgres pg_isready -U chart_repository -d chart_repository >/dev/null 2>&1; then \
			printf " ready\n"; \
			exit 0; \
		fi; \
		printf "."; \
		sleep 1; \
	done; \
	printf "\nTimed out waiting for solution repository Postgres on 127.0.0.1:5433\n"; \
	exit 1

solution-repo-seed: solution-repo-db solution-repo-db-wait
	cd $(SOLUTION_REPOSITORY_DIR) && $(NPM) run seed

solution-repo-stop: check-docker
	$(SOLUTION_REPOSITORY_COMPOSE) stop

solution-repo-typecheck:
	cd $(SOLUTION_REPOSITORY_DIR) && $(NPM) run typecheck

solution-repo-build:
	cd $(SOLUTION_REPOSITORY_DIR) && $(NPM) run build

solution-repo-verify: solution-repo-typecheck solution-repo-build

format:
	$(NPM) run format

format-check:
	$(NPM) run format:check
