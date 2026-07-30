# CHART

CHART is a climate-health planning platform.

## What runs

- `web`: the canonical Next planning interface and design system.
- `backend`: the single FastAPI application API and analytical engine.
- `orchestration`: Dagster jobs that fetch climate data before running a model.
- `pipelines`: climate adapters, boundaries, and versioned model runtimes.
- `infra`: local and EC2 deployment.

The old Fastify service is no longer installed, started, deployed, or allowed to
migrate the CHART database. Python and Alembic now own the application API and
database.

## Run locally

```bash
make install
make run
```

Open:

- Planning app: `http://127.0.0.1:3100/plan`
- Python API docs: `http://127.0.0.1:3210/docs`
- Dagster: `http://127.0.0.1:3002`
- R prediction model health: `http://127.0.0.1:8000/health`
- Keycloak: `http://127.0.0.1:8080`

The planning page lets an authorised MP user plan the next three months, save the
next hot season, or explore long-term heat. It shows the real climate values and
sources plus only the low-birth-weight model results validated for the selected
place. The current state-wide release shows one population association without
claiming a pregnancy-stage result. Saved plans and results survive reloads.

## Useful commands

```bash
make migrate
make climate-api
make dagster-run
make lbw-run
make web
make verify
```

Adding a place or model: [docs/add-geography-and-model.md](docs/add-geography-and-model.md).
The current design and remaining work are in [docs/tdd.md](docs/tdd.md).
