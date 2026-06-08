# CHART

CHART is a climate-health planning platform. This repository is a monorepo:

- `web`: Next web app for the public site, onboarding, dashboard, map UI, and public action repository.
- `api`: Fastify API for backend modules such as auth, role/geography context, and data ingestion.
- `solution-repository`: standalone Payload CMS service for maintaining published solution repository data. CHART core does not require it locally.
- `docker-compose.yml`: local Postgres and Keycloak for development infrastructure.
- `data/`: ignored local seed/import outputs.
- `docs/`: ignored local planning notes.

The root package is only a workspace controller. It is not the web app and should not contain framework-specific application code.

## Run locally

For a clean local setup and verification run:

```bash
make install
make all
```

To start the local app after setup:

```bash
make run
```

`make run` provisions local dependencies, then starts the Fastify API and
Next web app together. It stays running until stopped.

Open `http://127.0.0.1:3100`.

API docs are available at `http://127.0.0.1:3200/api`.
Orval can consume `http://127.0.0.1:3200/openapi.json` or
`http://127.0.0.1:3200/openapi.yaml`.

Local development runs CHART app data and Keycloak in the same Docker stack. CHART app
tables are defined in `api/src/db/schema.ts` and managed through Drizzle migrations.
Keycloak uses its own local Postgres database so identity internals do not mix with
CHART app tables.

Reference data is deployment-configurable:

- `CHART_GEOGRAPHY_SEED_FILE`: optional JSON file for the deployer's geography hierarchy.
- `CHART_SOLUTION_REPOSITORY_SNAPSHOT_FILE`: optional JSON snapshot for public solution repository reads. If unset, the bundled development snapshot under `api/src/modules/solution-repository/seed-data/seed.json` is used.
- `CHART_SOLUTION_REPOSITORY_URL`: optional public solution repository service URL for future remote adapter flows.

Seed sign-in users are available through Keycloak at `http://127.0.0.1:8080`:

- `chart-admin` / `password`
- `u1-health-region` / `password`
- `u2-sector-region` / `password`
- `u3-health-district` / `password`
- `u4-sector-district` / `password`

CHART role names are stable product roles. Geography level and scope decide whether
a user is working at country, state, county, district, sub-county, or another
deployment-specific level.

- `chart_admin`
- `content_editor`
- `health_planning_lead`
- `cross_sector_planning_lead`
- `health_implementation_officer`
- `cross_sector_implementation_officer`
- `public_viewer`

## DHIS2 health data source

CHART connects to DHIS2 as a health data source. Keep DHIS2 credentials in environment
variables; do not store secrets in Postgres.

Recommended configuration is a DHIS2 Personal Access Token from a dedicated read-only
service user:

```bash
DHIS2_BASE_URL=https://dhis2.example.org
DHIS2_API_VERSION=41
DHIS2_AUTH_MODE=pat
DHIS2_API_TOKEN=d2pat_...
```

The API exposes masked config and a connection check:

```bash
curl http://127.0.0.1:3200/sources/dhis2/config
curl -X POST http://127.0.0.1:3200/sources/dhis2/test-connection
```

DHIS2 organisation units should be mapped into CHART geographies through
`external_geography_mappings`; DHIS2 should not replace CHART's geography model.

## Solution repository boundary

CHART core has a solution repository adapter in `api/src/modules/solution-repository`.
It reads from a public JSON snapshot for local development and should later read from
the hosted repository service. It does not own solution repository database tables.

The Payload CMS implementation lives separately in `solution-repository/`. It owns
editing, media, publishing workflow, and repository auth. It can later be split into a
separate repository without changing CHART core.

Dependency direction:

```txt
solution-repository publishes data
        ↓
api reads public snapshot/API responses
        ↓
web reads from api
```

Do not import Payload files into `api/` or `web/`.

## EC2 deployment routing

The EC2 deployment exposes one public port:

- `http://<host>/`: CHART web app
- `http://<host>/identity`: Keycloak sign-in
- `http://<host>/chart-api`: Fastify API

Keycloak and the API still run on their container ports internally, but only the
reverse proxy publishes port `80`.

## Useful commands

```bash
make all
make run
make local-setup
make verify
make web-build
make web-typecheck
make identity
make identity-wait
make identity-sync
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
