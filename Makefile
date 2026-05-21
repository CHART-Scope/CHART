NPM := $(shell command -v npm || command -v /opt/homebrew/bin/npm || command -v /usr/local/bin/npm)
export PATH := $(dir $(NPM)):$(PATH)

.PHONY: install web web-build web-start web-seed web-typecheck api api-build api-start api-test api-typecheck airtable-import format format-check

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

airtable-import:
	$(NPM) run import:airtable:solutions

format:
	$(NPM) run format

format-check:
	$(NPM) run format:check
