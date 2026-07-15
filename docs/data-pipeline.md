# Data pipeline

Climate facts flow from ERA5 fixtures (today) through Dagster assets into CSV outputs
and optional Postgres loads.

## Commands

```bash
make migrate
PRESET=madhya-pradesh make climate-materialize
make dev                  # Dagster UI — http://127.0.0.1:3000
```

`PRESET` selects a geography partition (`madhya-pradesh`, `kajiado`, …). Materialisation
writes wide CSVs under `data/` and, when `DATABASE_URL` is set, loads **long-format**
rows into `district_climate`.

## Row shape

Postgres stores one row per admin unit × month × variable × climate run. A 60-month
window with three variables (`tmax`, `tmin`, `precip`) yields 180 rows — not 60 wide
columns. See `backend/README.md` for the rationale.

## Orchestration package

Dagster definitions live in `orchestration/src/chart_pipeline/`:

- `definitions.py` — climate asset, monthly schedule, and on-demand prediction sensor/job

Full operator notes: [orchestration/README.md](https://github.com/CHART-Scope/CHART/blob/main/orchestration/README.md)
in the repository.

## Handoff to the Python API

After materialisation, the climate predict API reads `district_climate` for preview and
LBW prediction. A preview still returns a manual `pull_hint`. Every new LBW outcome request
returns `202 Accepted`, persists an idempotent `prediction_request`, and is picked up by
`pending_prediction_requests_sensor`. Its Dagster run skips ERA5 when the required months
already exist and materialises only the requested geography when they are missing.
