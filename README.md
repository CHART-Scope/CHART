# CHART

CHART is a climate-health planning platform. This repository is a monorepo:

- `web`: Next/Payload web app for the public site, CMS workflow, dashboard, and map UI.
- `api`: Fastify API for backend modules such as auth, role/geography context, and data ingestion.
- `docker-compose.yml`: local Postgres and Keycloak for development infrastructure.
- `data/`: ignored local seed/import outputs.
- `docs/`: ignored local planning notes.

The root package is only a workspace controller. It is not the web app and should not contain framework-specific application code.

## Run locally

```bash
make install
docker compose up -d chart-postgres chart-keycloak
make api-db-migrate
make api-db-seed
make api
make web
```

Open `http://127.0.0.1:3100`.

API docs are available at `http://127.0.0.1:3200/api`.
Orval can consume `http://127.0.0.1:3200/openapi.json` or
`http://127.0.0.1:3200/openapi.yaml`.

Local Postgres uses one database, `chart`. Drizzle manages only the CHART app
tables from `api/src/db/schema.ts`; Payload and Keycloak manage their own tables in
the same database.

Seed sign-in users are available through Keycloak at `http://127.0.0.1:8080`:

- `u1-health-india` / `password`
- `u2-sector-kenya` / `password`
- `u3-health-gwalior` / `password`
- `u4-sector-loitokitok` / `password`

## EC2 demo routing

The EC2 deployment exposes one public port:

- `http://<host>/`: CHART web app
- `http://<host>/identity`: Keycloak sign-in
- `http://<host>/api`: Next/Payload API
- `http://<host>/chart-api`: Fastify API

Keycloak and the API still run on their container ports internally, but only the
reverse proxy publishes port `80`.

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
