# CHART Python backend

SQLAlchemy models and Alembic migrations for the CHART data plane.

Start with the **climate spine** tables in `chart/shared/db/models.py` (TDD §7).

```bash
export DATABASE_URL=postgresql+psycopg://chart:chart@localhost:5434/chart
pip install -e backend
cd backend && alembic upgrade head
```

Orchestration docs: `orchestration/README.md`.

Climate predict API:

```bash
pip install -e 'backend[dev]'
export DATABASE_URL=postgresql+psycopg://chart:chart@localhost:5434/chart
make climate-api        # Swagger UI http://127.0.0.1:3210/docs
make climate-openapi    # writes docs/openapi/climate.json
```

Human-readable reference: [docs/climate-api.md](../docs/climate-api.md).

## `district_climate` row shape

ERA5 CSV output is **wide** (one column per metric). Postgres stores **long** facts — one row per
admin unit × month × variable × climate run.

| column           | role                                                     |
| ---------------- | -------------------------------------------------------- |
| `admin_unit_id`  | which geography (MP, Kajiado, later districts)           |
| `climate_run_id` | which ingest run (window, provenance, idempotent hash)   |
| `period_month`   | first day of the calendar month                          |
| `variable`       | metric name, e.g. `tmax_monthly_mean_c`, `heatwave_days` |
| `value`          | numeric measurement                                      |
| `unit`           | `degC`, `days`, etc. — kept per variable, not inferred   |
| `agg_method`     | how the value was produced, e.g. `bbox_mean`             |

**Why long, not wide?**

- New metrics (rainfall, humidity, CMIP6 scenarios) are new rows, not new columns.
- One stable grain for queries: `WHERE variable = '…' AND period_month BETWEEN …`
- `unit` and `agg_method` can differ per variable without schema churn.
- Matches the TDD fact-table pattern used by VRA / health-impact consumers.

**Row count (MVP):** 5 years × 12 months × 3 variables = **180 rows** per preset per materialisation.
`climate_load.py` unpivots the wide CSV on ingest.

Example query:

```sql
SELECT period_month, variable, value, unit
FROM district_climate
WHERE climate_run_id = 1
ORDER BY period_month, variable;
```

**Freshness:** after each successful materialisation, `data_source.last_refreshed_at` is updated
for the geography's ERA5 row. Check staleness with:

```sql
SELECT g.slug, ds.cadence, ds.last_refreshed_at
FROM data_source ds
JOIN geography g ON g.id = ds.geography_id
WHERE ds.name = 'Copernicus ERA5 single levels';
```
