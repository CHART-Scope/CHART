# CHART

CHART is a climate-health planning platform. This repository is a monorepo:

- `web`: Next/Payload web app for the public site, CMS workflow, dashboard, and map UI.
- `api`: Fastify API for backend modules such as auth, role/geography context, and data ingestion.
- `docker-compose.yml`: local Postgres and Keycloak for demo/development infrastructure.
- `data/`: ignored local seed/import outputs.
- `docs/`: ignored local planning notes.

The root package is only a workspace controller. It is not the web app and should not contain framework-specific application code.

## Run locally

```bash
make install
docker compose up -d chart-postgres
make api-db-migrate
make api-db-seed
make web
```

Open `http://127.0.0.1:3100`.

## Useful commands

```bash
make web-build
make web-typecheck
make web-seed
make identity
make api-db-generate
make api-db-migrate
make api-db-check
make api-db-seed
make api-openapi-generate
make api-test
make api-build
make format-check
```

## Structure rule

Keep each app isolated:

- Web/UI code stays in `web`.
- Backend API code stays in `api`.
- Future Python or data services should be added as separate apps/services, not mixed into the Next app.
