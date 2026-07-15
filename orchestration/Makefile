# Run from repo root: `make migrate`, `make dev`, etc.
# This wrapper forwards common targets when your shell is already in orchestration/.

ROOT := ..
PYTHON ?= python3.11

.PHONY: help migrate dev climate-materialize climate-migrate climate-api dagster-dev

help:
	@$(MAKE) -C $(ROOT) help

migrate:
	@$(MAKE) -C $(ROOT) migrate

dev:
	@$(MAKE) -C $(ROOT) dev

climate-api:
	@$(MAKE) -C $(ROOT) climate-api

climate-materialize:
	@$(MAKE) -C $(ROOT) climate-materialize PRESET="$(PRESET)"

climate-migrate:
	@$(MAKE) -C $(ROOT) climate-migrate

dagster-dev: dev
