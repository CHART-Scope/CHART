# Python backend

CHART's target backend lives in `backend/chart/`. It is split into **shared data models**,
**climate engine** code, and a growing **FastAPI surface** — all importable from Dagster
without pulling in HTTP framework details.

## Layout

```txt
backend/
  chart/
    shared/db/          # SQLAlchemy models + Alembic migrations
    climate/            # Catalog, preview, predict service logic
    api/                # FastAPI app (climate routes today; app modules next)
  alembic/
  tests/
orchestration/
  chart_pipeline/       # Dagster assets — imports chart.*, not FastAPI
```

## Runtime faces

| Face | Entry | Port (local) |
|---|---|---|
| Climate predict API | `make climate-api` | 3210 |
| Dagster | `make dev` | 3000 |
| LBW inference (R) | `pipelines/LBW_demo/inference` | 8000 |

Climate predict reads `district_climate` from Postgres when `DATABASE_URL` is set,
then optionally calls the LBW Plumber service for `outcome.type=lbw`.

## Database

Postgres holds the climate spine (`district_climate`, `data_source`, …). Migrations
run through Alembic in `backend/`; the Makefile also applies Drizzle migrations for
the interim Fastify app tables on the same database.

```bash
export DATABASE_URL=postgresql+psycopg://chart:chart@localhost:5434/chart
pip install -e 'backend[dev]'
cd backend && alembic upgrade head
```

## OpenAPI

Python services export machine-readable contracts:

```bash
make climate-openapi    # docs/openapi/climate.json
```

Human-readable notes: [Climate API](climate-api.md). Interactive embed:
[OpenAPI reference](api-reference.md).

## Migration from Fastify

New endpoints should land in `backend/chart/api/` first. The web app will switch to
generated clients against the Python OpenAPI contract as each module moves. See
[Legacy Fastify API](legacy-fastify-api.md) for what still runs on TypeScript today.
