# Python backend

`backend/chart/` is the only CHART backend.

```txt
backend/
  chart/
    api/                  # FastAPI application and OpenAPI export
    auth/                 # Keycloak token and access checks
    setup/ users/         # Application setup and user management
    workspaces/           # Geography-scoped planning workspaces
    geographies/          # User places and analytical area mapping
    climate/              # Source-neutral monthly data and requests
    model_registry/       # Versioned model files and place mapping
    inference/            # Deterministic scorer and optional explanation
    solution_repository/  # Public repository adapter
    shared/db/            # SQLAlchemy models; Alembic owns the schema
    vra/                  # Future module placeholder only
  alembic/
  tests/
orchestration/
  src/chart_pipeline/     # Dagster assets — imports chart.*, not FastAPI
```

Dagster imports these services through thin wrappers. Analytical code does not
import FastAPI or Dagster.

## Database and API

| Face | Entry | Port (local) |
|---|---|---|
| Climate predict API | `make climate-api` | 3210 |
| Dagster | `make dev` | 3002 |
| Model registry runtime (R) | `pipelines/models/inference` | 8000 |

Climate predict reads `district_climate` from Postgres when `DATABASE_URL` is set,
then optionally calls the LBW Plumber service for `outcome.type=lbw`.

## Database

Postgres holds the climate spine (`district_climate`, `data_source`, …). Migrations
and application tables. Alembic in `backend/` is the sole schema owner.

```bash
make migrate
make climate-api
make climate-openapi
```

## OpenAPI

Python services export machine-readable contracts:

```bash
make climate-openapi    # docs/openapi/climate.json
```

Human-readable notes: [Climate API](climate-api.md). Interactive contracts:
[API explorer](api-reference.md).

Place and model handoff: [Add a geography and model](add-geography-and-model.md).
