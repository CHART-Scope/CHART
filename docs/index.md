# CHART documentation

CHART uses one Python API, Dagster for background data work, Keycloak for
access, Postgres/PostGIS for saved data and results, and the canonical Next web
app for the browser experience.

This site explains how to run the platform locally and operate its application,
model, and climate data pipeline.

## Start here

Follow [Getting started](getting-started.md) to install CHART, start the complete
local environment, and verify that it is working.

!!! note "Local and published addresses"
    This documentation site is public. Addresses beginning with `127.0.0.1`
    refer to services on your own computer and only work after you start CHART
    locally.

## Runtime

CHART has one Python backend (`backend/chart/`):

- **FastAPI** for synchronous app and engine endpoints
- **Dagster** for batch climate ingestion and model handoffs
- **SQLAlchemy + Alembic** as the sole schema owner

The retired Fastify/Drizzle API is not installed, started, or deployed.

## Read next

| Page | Use it for |
|---|---|
| [Getting started](getting-started.md) | Install and run CHART locally |
| [Python backend overview](python-backend.md) | Build FastAPI modules |
| [Modeling](modeling.md) | Understand the LBW model, inputs, outputs, and limitations |
| [Climate API](climate-api.md) | Understand preview and prediction parameters |
| [API explorer](api-reference.md) | Browse the published API contracts |
| [Data pipeline](data-pipeline.md) | Run Dagster assets and materialisation |
| [Add a geography and model](add-geography-and-model.md) | Extend the supported analytical areas |
