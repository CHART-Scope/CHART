# CHART

CHART is a climate-health planning platform.

Documentation: [https://chart-scope.github.io/CHART/docs/](https://chart-scope.github.io/CHART/docs/)

CHART is developed as open-source infrastructure for public-interest climate
and health planning. Its project-authored software and documentation are
[GNU Affero General Public License v3.0](LICENSE). See [NOTICE](NOTICE) for
copyright, dependency, and imported-content boundaries. The project is
designed to support digital-public-good principles; this is a statement of
intent, not a claim of certification by the Digital Public Goods Alliance.

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

## Digital public good and licence

CHART is designed to be inspected, adapted, self-hosted, and improved by
public institutions and their partners. Hosted modifications remain subject
to the AGPL network-source requirements.

The repository may also reference imported action records, media, restricted
health data, or model artefacts with separate rights and distribution rules.
The project licence does not override those restrictions.

Read the [digital public good and licensing guide](docs/licensing.md) before
redistributing CHART or operating a modified public service. This
digital-public-good statement describes the project's intent and does not
claim current certification by the Digital Public Goods Alliance.
