# CHART climate orchestration (Dagster)

Iterative path from **seeing CSV files** → **Dagster materialisation** → **Postgres tables**
defined in SQLAlchemy (TDD §7 climate spine).

This package is thin: compute stays in `pipelines/era5_heat/`; schema stays in
`backend/chart/shared/db/`; Dagster only wires the steps.

## Iteration ladder

### Step 0 — see data with no orchestration (5 minutes)

Proves CDS/fixture path and output shape.

```bash
pip install -e pipelines/era5_heat[dev]

# Offline (no CDS account):
python -m era5_heat --preset madhya-pradesh --years 5 --end-year 2024 \
  --outdir data/climate --format csv -v
# Add fixture flag by using the Python API:
python - <<'PY'
from era5_heat import fixture_demo
from era5_heat.io import output_paths, write_json, write_table
from pathlib import Path
df, meta = fixture_demo("madhya-pradesh", years=5, end_year=2024)
outdir = Path("data/climate"); outdir.mkdir(parents=True, exist_ok=True)
table, meta_path = output_paths(outdir, "madhya-pradesh", 2020, 2024, "csv")
write_table(df, table, "csv"); write_json(meta, meta_path)
print(table, meta_path)
PY

# Real ERA5 (needs ~/.cdsapirc or CDSAPI_URL + CDSAPI_KEY):
python -m era5_heat --preset madhya-pradesh --years 5 --end-year 2024 \
  --outdir data/climate -v
```

Inspect `data/climate/*.csv` and `*_meta.json`.

### Step 1 — Dagster wraps Step 0

```bash
pip install -e backend -e pipelines/era5_heat -e orchestration

export ERA5_USE_FIXTURE=1          # or use real CDS credentials
export DATABASE_URL=postgresql+psycopg://chart:chart@localhost:5434/chart
export DAGSTER_HOME=$PWD/orchestration
make dev
```

In the UI (http://127.0.0.1:3000), open **era5_observed_climate** and materialise a **partition**
(`madhya-pradesh` or `kajiado`).

Config knobs on the asset:

| field           | default             | meaning                                         |
| --------------- | ------------------- | ----------------------------------------------- |
| partition       | required            | `madhya-pradesh` or `kajiado`                   |
| `years`         | `5`                 | MVP window length                               |
| `end_year`      | prior calendar year | last calendar year in window                    |
| `use_fixture`   | `false`             | offline sample data                             |
| `load_database` | `true`              | upsert into Postgres when `DATABASE_URL` is set |

**Monthly cadence:** `monthly_era5_refresh_schedule` runs on the 5th of each month for every
partition (stopped by default in local dev — enable it in the Dagster UI). Each successful load
updates `data_source.last_refreshed_at` for that geography.

**On-demand cadence:** `pending_prediction_requests_sensor` is enabled by default. Every new
outcome prediction is written to Postgres; the sensor launches one idempotent Dagster run for
that request. The run uses stored climate data when ready and materialises only the requested
geography when data is missing. Postgres holds user-visible status/result state, while Dagster
holds run history and logs. No Redis or separate queue is required.

### Step 2 — SQLAlchemy tables + Alembic

Climate spine tables (first slice of TDD §7):

| table                | purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `geography`          | one row per place we ingest (MP and Kajiado are first; more can be added)           |
| `admin_unit`         | bbox-level unit for MVP (state/county)                                              |
| `data_source`        | ERA5 CDS registry row; `cadence` + `last_refreshed_at` track freshness              |
| `provenance`         | file URI + input hash                                                               |
| `climate_run`        | one idempotent ingest run                                                           |
| `district_climate`   | monthly facts — long format: one row per month × variable (see `backend/README.md`) |
| `prediction_request` | durable API request, Dagster run id, status, and persisted prediction result        |

```bash
# Example: local Postgres (any VM — AWS EC2, GCP Compute, Azure VM, laptop)
export DATABASE_URL=postgresql+psycopg://chart:chart@localhost:5434/chart

pip install -e backend
cd backend && alembic upgrade head
```

Re-materialise the Dagster asset with `DATABASE_URL` set. Query:

```sql
SELECT g.name, dc.period_month, dc.variable, dc.value
FROM district_climate dc
JOIN admin_unit au ON au.id = dc.admin_unit_id
JOIN geography g ON g.id = au.geography_id
ORDER BY dc.period_month, dc.variable
LIMIT 20;
```

### Step 3 — what comes next (not built yet)

1. **Object store** — land raw NetCDF in MinIO/S3 before aggregation.
2. **Real admin polygons** — replace bbox `agg_method=bbox_mean` with PostGIS zonal stats.
3. **`health_impact` asset** — after `erf_parameters` handoff exists.
4. **Seasonal + projection tiers** — new Dagster assets, same `district_climate` table shape.

**LBW bridge (done):** Python API `POST /climate/predict` on port 3210 (`make climate-api`).

### Verify API → Dagster → Postgres → R prediction

Use a fresh migrated database for a guaranteed background pull. Run these in separate terminals:

```bash
make services
make climate-migrate

cd pipelines/LBW_demo
bash run_api.sh
```

```bash
make dev
```

```bash
make climate-api
```

Then trigger and poll the request:

```bash
python3.11 backend/scripts/verify_on_demand_prediction.py --end-month 2020-12
```

Open `http://127.0.0.1:3000/runs` and filter by the printed
`prediction_request_id`. The script also reads the completed row from Postgres and prints
its `dagster_run_id`, `climate_run_id`, and persisted LBW `odds_ratio`. Repeating the same
completed request returns the persisted prediction immediately without a new run. A new request
always enters Dagster, but skips the ERA5 pull when its climate window already exists.

## Adding more geographies

Madhya Pradesh and Kajiado are just the first two. The pipeline is built to add more the same way.

**One geography = one Dagster partition.** The partition list comes from `PRESETS` in
`pipelines/era5_heat/src/era5_heat/districts.py`. You do not need a new asset or a DB migration.

To add another place:

1. Add a slug + bbox to `PRESETS` (e.g. `"uttar-pradesh": District(...)`).
2. Restart `make dev` — the new partition shows up in the Dagster UI.
3. Materialise that partition once (or wait for the monthly schedule).

On first load, Postgres auto-creates:

- a `geography` row
- an `admin_unit` row (bbox for now)
- a `data_source` row (`cadence=monthly`, `last_refreshed_at` updated each run)
- `district_climate` rows (180 per geography for the default 5-year window)

The monthly schedule already loops **all** partitions — new geographies are included automatically.

**Later, at scale:** if geographies are added by users in the app (not in code), switch to
Dagster dynamic partitions. The asset, tables, and loader stay the same.

## Climate predict API (Python, LBW bridge)

The Python API (`backend/chart/api`) exposes `/climate/*` on port **3210**.

| Docs               | URL                                                  |
| ------------------ | ---------------------------------------------------- |
| Swagger UI         | http://127.0.0.1:3210/docs                           |
| ReDoc              | http://127.0.0.1:3210/redoc                          |
| OpenAPI JSON       | http://127.0.0.1:3210/openapi.json                   |
| Markdown reference | `docs/climate-api.md`                                |
| Exported spec      | `docs/openapi/climate.json` (`make climate-openapi`) |

The Fastify app (`:3200`) keeps its own Swagger UI at `/api` and contract at `api/openapi.yaml`.

```bash
# Terminal 1 — climate API
make climate-api

# Terminal 2 — LBW inference (MP only)
cd pipelines/LBW_demo/inference && Rscript api.R

# Preview coverage
curl -s http://127.0.0.1:3210/climate/preview \
  -H 'content-type: application/json' \
  -d '{"location_slug":"madhya-pradesh","timeframe_id":"exposure_3m"}' | jq .

# Predict (Postgres temps -> LBW /predict)
curl -s http://127.0.0.1:3210/climate/predict \
  -H 'content-type: application/json' \
  -d '{"location_slug":"madhya-pradesh","timeframe_id":"exposure_3m","outcome":{"type":"lbw","trimester":1}}' | jq .
```

Set `DATABASE_URL` and `LBW_SERVICE_URL` (default `http://127.0.0.1:8000`).

## Environment variables

| Variable                    | Used by                | Purpose                       |
| --------------------------- | ---------------------- | ----------------------------- |
| `DATABASE_URL`              | Alembic, Dagster asset | Postgres connection string    |
| `ERA5_USE_FIXTURE`          | Dagster asset          | `1` = offline fixture, no CDS |
| `ERA5_MVP_YEARS`            | Dagster defaults       | default window length         |
| `ERA5_MVP_END_YEAR`         | Dagster defaults       | default end year              |
| `CLIMATE_OUTPUT_DIR`        | Dagster asset          | CSV/meta output directory     |
| `CDSAPI_URL` / `CDSAPI_KEY` | era5_heat              | CDS credentials in CI/VM      |
| `DAGSTER_HOME`              | Dagster                | local Dagster state           |

## VM sizing (climate ingest only)

This step is **I/O bound** (CDS download + pandas), not LLM/GPU heavy.

| Tier                    | vCPU |    RAM | Good for                     |
| ----------------------- | ---: | -----: | ---------------------------- |
| Dev / fixture           |    2 |  4 GiB | offline iteration            |
| MVP ingest              |    4 |  8 GiB | ERA5 pull for 2 geographies  |
| Batch + DB on same host |    4 | 16 GiB | Dagster + Postgres on one VM |

Same shape works on AWS (`t3.xlarge`), GCP (`e2-standard-4`), Azure (`Standard_D4s_v5`).

## Repo layout (TDD-aligned)

```text
pipelines/era5_heat/     # compute library (no Dagster imports)
backend/chart/shared/db/ # SQLAlchemy models + Alembic (sole schema owner)
orchestration/           # Dagster assets only
data/climate/            # generated CSV + meta (gitignored)
```

## Make shortcuts (from repo root)

```bash
make migrate             # start Postgres, run Drizzle + Alembic
make dev                 # Dagster UI
make climate-api         # Python climate predict API (:3210)
make climate-materialize # one partition (PRESET=kajiado make climate-materialize)
make era5-fixture        # write MVP CSV without Dagster
```

Already inside `orchestration/`? The same targets work via `orchestration/Makefile`
(e.g. `make dev` from this folder forwards to the repo root).
