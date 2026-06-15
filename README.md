# CHART

CHART is a climate-health planning platform.

This repo contains the core app:

- `web`: Next app for the public site, onboarding, dashboard, map UI, and solution repository UI.
- `api`: Fastify API for auth context, setup, users, workspaces, geographies, hazards, and solutions.
- `infra/docker-compose.yml`: local Postgres and Keycloak.

The solution repository is consumed through `CHART_REPOSITORY_URL` when available.
If it is unset, the API uses the bundled snapshot in
`api/src/services/chart-repository/seed-data/seed.json`.

## Run Locally

```bash
make install
make run
```

Open the web app at `http://127.0.0.1:3100`.

## Routes

Local development:

- `http://127.0.0.1:3100`: web app
- `http://127.0.0.1:3200/api`: API docs
- `http://127.0.0.1:8080`: Keycloak

Deployed app:

- `http://<host>/`: web app
- `http://<host>/chart-api`: API
- `http://<host>/identity`: Keycloak

## Configuration

- `CHART_REPOSITORY_URL`: hosted solution repository API.
- `CHART_REPOSITORY_SNAPSHOT_FILE`: optional local snapshot override.
- `CHART_GEOGRAPHY_SEED_FILE`: optional geography seed override.

## Useful Commands

```bash
make run
make verify
make api-test
make api-build
make web-typecheck
make web-build
make format-check
```
