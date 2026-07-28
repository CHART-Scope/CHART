# Data pipeline

The user chooses a place and a simple planning option. CHART resolves the exact
three months. Dagster then saves the data before any model call.

```mermaid
flowchart LR
  choice["Place + next 3 months, hot season, or long term"] --> request["Saved plan"]
  request --> pull["Fetch missing climate months"]
  pull --> rows["Three saved monthly values"]
  rows --> check["Data check"]
  check --> model["Validated model block or blocks"]
  model --> result["Saved model result + source trace"]
```

The shared climate record requires the place, month, Celsius value, source,
issue and valid dates, quality, freshness, area calculation version, raw file,
and hash. The saved model input always has exactly three consecutive months in
newest-to-oldest order.

Mixed windows are normal: a July planning request can use a C3S forecast for
July and ERA5 history for May and June. The dashboard labels each row as a
forecast or historical input. Live runs replace sample or stale rows before the
model call, fetch only the exact required ERA5 months, and reject incomplete
calendar months.

Sources currently supported in code:

- ERA5 for past/reanalysis work and historical charts;
- official C3S seasonal monthly data for the future planning window;
- ISIMIP3b bias-adjusted projections for the MP March–May 2031–2040 scenario
  slice; the user must choose SSP1-2.6, SSP3-7.0, or SSP5-8.5;
- fixtures for tests only.

Near-term ECMWF AWS remains unavailable until its complete-month checks are
implemented. Long-term values are scenario averages, never labelled forecasts.

Run and inspect:

```bash
make migrate
make dagster-run
make climate-api
```

The dashboard shows the request ID, Dagster run ID, each monthly value and
source, model release, only the place's validated model results, and any warning. A
next-hot-season plan waits in Postgres and is queued automatically when C3S can
cover the season.
