# CHART documentation

CHART is a climate-health planning platform. This site documents how the system is built,
how to run the data plane locally, and how to call the **Python APIs** that are replacing
the interim TypeScript backend.

## Where we are headed

The long-term backend is **one Python monolith** (`backend/chart/`):

- **FastAPI** for synchronous app and engine endpoints
- **Dagster** for batch climate ingestion and model handoffs
- **SQLAlchemy + Alembic** as the sole schema owner

The Fastify API in `api/` remains for the current web app while modules migrate over,
module by module, behind the same OpenAPI contract.

## Quick start (climate spine)

```bash
make migrate
PRESET=madhya-pradesh make climate-materialize
make climate-api          # Python API on :3210 — Swagger at /docs
make dev                  # Dagster UI on :3000
```

Export specs for this docs site:

```bash
make climate-openapi
make docs-serve          # http://127.0.0.1:8000 — uses uv when installed
```

## Read next

| Page | Audience |
|---|---|
| [Python backend overview](python-backend.md) | Contributors building FastAPI modules |
| [Climate API](climate-api.md) | Preview + LBW predict parameters |
| [OpenAPI reference](api-reference.md) | Interactive specs embedded in the site |
| [Data pipeline](data-pipeline.md) | Dagster assets and materialisation |
| [Architecture](architecture.md) | Containers, ports, and deployment |
| [Legacy Fastify API](legacy-fastify-api.md) | Interim TypeScript API (being retired) |
