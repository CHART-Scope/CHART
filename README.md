# CHART

CHART is a climate-health planning platform. This repository is a monorepo:

- `web`: Next web app for the public site, onboarding, dashboard, map UI, and public action repository.
- `api`: Fastify API for backend modules such as auth, role/geography context, workspaces, and public chart-repository reads.
- `chart-repository`: standalone Payload CMS and public repository API for maintaining published CHART repository data. CHART core does not require it locally.
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
- `CHART_REPOSITORY_SNAPSHOT_FILE`: optional JSON snapshot for public repository reads. If unset, the bundled development snapshot under `api/src/services/chart-repository/seed-data/seed.json` is used.
- `CHART_REPOSITORY_URL`: optional public CHART repository service URL. When set, the API reads published repository content from that service; otherwise it uses the bundled snapshot.

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

## CHART repository boundary

CHART core has a repository gateway in `api/src/services/chart-repository`.
The Fastify API exposes thin `hazards` and `solutions` route modules that read
through that service. It uses a public JSON snapshot for local development and can
read from the hosted `chart-repository` service through `CHART_REPOSITORY_URL`.
It does not own repository database tables.

Onboarding still asks for priority hazards so dashboards can be personalized, but
those choices come from the gateway and are stored only as setup context.

The Payload CMS implementation lives separately in `chart-repository/`. It owns
editing, media, publishing workflow, repository auth, and the public repository API.
That service can publish richer repository-owned content such as health implications
without making CHART core own those database tables.
It can later be split into a separate repository without changing CHART core.

Dependency direction:

```txt
chart-repository publishes data
        ↓
api reads public snapshot/API responses through services/chart-repository
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
