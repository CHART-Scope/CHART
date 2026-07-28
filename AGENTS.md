# CHART Agent Guide

## Purpose

This guide keeps generated code consistent across the whole CHART repo.

Generated code should be:

- consistent
- small
- testable
- easy to refactor

## Project Shape

CHART is a monorepo. Do not treat the root as a Next app.

- `new_design`: connected CHART Next planning app and current product UI.
- `web`: older CHART Next shell retained during migration.
- `backend`: Python/FastAPI application API and analytical engine; owner of auth, workspaces, users, geographies, predictions, and analytical reads.
- `orchestration`: Dagster data plane importing the Python `chart` package.
- `api`: local solution-repository seed data only. The Fastify/Drizzle service is retired.
- `chart-repository`: separate Payload CMS service for maintaining published chart repository data. It is not required to run CHART core.
- `infra`: local services, CHART workload manifests, and AWS deployment handoff.
- `data/`: local generated seed/import outputs, ignored by git.
- `docs/`: local planning notes, ignored by git.

Python or data-processing code belongs in `backend`, `orchestration`, or a focused `pipelines` package, never inside either Next app.

Next route handlers may be thin browser/session proxies during migration. They must not own business workflows, Keycloak authorization policy, or CHART database tables. Do not add a Next.js BFF.

## Directory Boundaries

Use this target structure while preserving current top-level names:

```txt
backend/
  chart/api/
  chart/auth/
  chart/climate/
  chart/shared/db/

orchestration/
  src/chart_pipeline/

new_design/
  src/features/planning/
  src/lib/

web/
  src/modules/

chart-repository/
  payload.config.ts
  src/collections/
  src/app/(payload)/
  src/lib/
  Dockerfile
  infra/docker-compose.yml
```

The chart repository and CHART core mean different things:

- `backend/chart/solution_repository`: CHART adapter for reading a public repository snapshot/API. It must not define repository-owned Payload tables.
- `chart-repository`: standalone Payload CMS service that owns editing, media, publishing workflow, and repository auth.

Dependency direction:

```txt
chart-repository publishes data
        ↓
Python backend reads public snapshot/API responses
        ↓
new_design reads from Python backend
```

Never import from `chart-repository/` into `backend/`, `new_design/`, or `web/`. Use an HTTP API or public JSON snapshot instead.

## Current Stack

- Web: Next, React.
- API + engine: Python, FastAPI, SQLAlchemy, Alembic.
- Data plane: Dagster with Postgres-backed durable requests.
- Database: PostgreSQL + PostGIS.
- Formatting: Prettier.

## Project Priorities

Build in this order:

1. `auth`
2. `planning-workspace`
3. `dashboard`
4. `planning`
5. `budget-justification`

## General Rules

- Prefer simple code over abstract code.
- Prefer small files over large multi-purpose files.
- Prefer named exports over default exports.
- Keep functions focused on one job.
- Keep route handlers thin.
- Keep business logic out of UI components.
- Do not add dependencies unless there is a clear reason.
- Do not invent new folder patterns unless needed.
- Refactor only when there is actual code pressure.

## Python Backend Module Shape

Start simple and keep routes thin:

```txt
module/
  schemas.py
  service.py
  routes.py

backend/tests/
  test_<module>_api.py
```

Use `routes.py` for HTTP endpoints and `service.py` for behavior. Engine compute must not import FastAPI or Dagster. Dagster definitions call backend services through thin wrappers.

Every new Python API route should have a route-level test using FastAPI `TestClient`. Every protected route must test both authentication and role/geography denial.

## Backend Route Rules

- Route files define endpoints only.
- Route handlers should read params/body, call service functions, and map results to HTTP responses.
- Route handlers should not contain business workflows.
- Keep error responses explicit and stable.
- Prediction submission and status lookup must enforce geography scope, not merely bearer-token presence.
- Postgres is the durable request/state store and Dagster executes background pipeline work; do not add Redis or another queue without demonstrated pressure.

## Frontend Module Shape

Keep current feature UI under `new_design/src/features/`.

- Use `PascalCase.tsx` for React components.
- Keep routes and shared layout code under `new_design/src/app/`.
- Keep static copy and seed-like UI data close to the module using it.
- Use simple props/state first; avoid state libraries until shared state is actually needed.

## Naming

- Folders: `kebab-case`.
- Python backend files: `schemas.py`, `service.py`, `routes.py`; route tests live under `backend/tests/`.
- React components: `PascalCase.tsx`.
- Functions: `camelCase` with clear verbs, such as `getCurrentUser` or `listSources`.
- Types: `PascalCase`.
- Constants: `camelCase`, unless the value is a true cross-module constant.

## Product Rules

- Public content and the action repository stay accessible without login.
- Authenticated features should be scoped to role and geography.
- Build for the health planning lead and cross-sector planning lead flow first.
- Prefer simple seeded data before adding real integrations.
- Keep the first user flow understandable before making it comprehensive.
- Do not make CHART core depend on Payload CMS. Python should consume the published solution repository through an adapter and public snapshots or a remote API, not repository-owned tables.
- Deterministic prediction results must succeed without the optional Qwen explanation service.
- Production infrastructure reuses the generic OpenTofu/k3s/RDS/Flux pattern from `halla-health-infra`, but CHART owns separate state, stores, compute, namespaces, images, and manifests.

## Validation

Before finishing Python backend work:

```bash
python -m pytest backend/tests -q
python -m pytest orchestration/tests -q
```

Before finishing frontend work:

```bash
make new-design-build
make new-design-typecheck
```

Before finishing broad repo work:

```bash
make format-check
```
