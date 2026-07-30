# CHART documentation

CHART is a climate-health planning platform. This site explains how to run the
project locally, work with its Python and TypeScript APIs, and operate the
climate data pipeline.

## Start here

Follow [Getting started](getting-started.md) to install CHART, start the complete
local environment, and verify that it is working.

!!! note "Local and published addresses"
    This documentation site is public. Addresses beginning with `127.0.0.1`
    refer to services on your own computer and only work after you start CHART
    locally.

## Where we are headed

The long-term backend is **one Python monolith** (`backend/chart/`):

- **FastAPI** for synchronous app and engine endpoints
- **Dagster** for batch climate ingestion and model handoffs
- **SQLAlchemy + Alembic** as the sole schema owner

The Fastify API in `api/` remains for the current web app while modules migrate over,
module by module, behind the same OpenAPI contract.

## Read next

| Page | Use it for |
|---|---|
| [Getting started](getting-started.md) | Install and run CHART locally |
| [Python backend overview](python-backend.md) | Build FastAPI modules |
| [Climate API](climate-api.md) | Understand preview and prediction parameters |
| [API explorer](api-reference.md) | Browse the published API contracts |
| [Data pipeline](data-pipeline.md) | Run Dagster assets and materialisation |
| [Legacy Fastify API](legacy-fastify-api.md) | Maintain modules awaiting migration |
