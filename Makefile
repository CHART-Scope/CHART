NPM := $(shell command -v npm || command -v /opt/homebrew/bin/npm || command -v /usr/local/bin/npm)
export PATH := $(dir $(NPM)):$(PATH)

DRIZZLE_JOURNAL := api/drizzle/meta/_journal.json

.PHONY: help install web web-build web-start web-seed web-typecheck api api-build api-start api-test api-typecheck db-generate db-migrate db-check db-seed api-db-generate api-db-migrate api-db-check api-db-seed api-openapi-generate identity identity-down format format-check ensure-drizzle-journal

help:
	@printf "\nCHART commands\n"
	@printf "  make identity       Start local Postgres and Keycloak\n"
	@printf "  make web            Run the Next/Payload app\n"
	@printf "  make api            Run the Fastify API\n"
	@printf "  make db-generate    Generate a Drizzle migration from api/src/db/schema.ts\n"
	@printf "  make db-check       Check Drizzle migration consistency\n"
	@printf "  make db-migrate     Apply API migrations to the configured database\n"
	@printf "  make db-seed        Seed API reference data\n"
	@printf "  make api-test       Run API tests\n"
	@printf "  make web-typecheck  Typecheck the web app\n"
	@printf "  make format-check   Check formatting\n\n"

install:
	$(NPM) install

web:
	$(NPM) run dev:web

web-build:
	$(NPM) run build:web

web-start:
	$(NPM) run start:web

web-seed:
	$(NPM) run seed:web

web-typecheck:
	$(NPM) run typecheck:web

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

identity:
	docker compose up -d chart-postgres chart-keycloak

identity-down:
	docker compose stop chart-keycloak

format:
	$(NPM) run format

format-check:
	$(NPM) run format:check
