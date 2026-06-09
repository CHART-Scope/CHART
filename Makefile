NPM := $(shell command -v npm || command -v /opt/homebrew/bin/npm || command -v /usr/local/bin/npm)
export PATH := $(dir $(NPM)):$(PATH)

.PHONY: install web web-build web-start web-seed web-typecheck web-storybook web-storybook-build api api-build api-start api-test api-typecheck api-db-generate api-db-migrate api-db-check api-db-seed api-openapi-generate identity identity-down airtable-import format format-check

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

api-db-generate:
	$(NPM) run db:generate:api

api-db-migrate:
	$(NPM) run db:migrate:api

api-db-check:
	$(NPM) run db:check:api

api-db-seed:
	$(NPM) run db:seed:api

api-openapi-generate:
	$(NPM) run openapi:generate:api

identity:
	docker compose up -d chart-postgres chart-keycloak

identity-down:
	docker compose stop chart-keycloak

airtable-import:
	$(NPM) run import:airtable:solutions

format:
	$(NPM) run format

format-check:
	$(NPM) run format:check
