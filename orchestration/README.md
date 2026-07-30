# CHART data and prediction jobs

Dagster runs background work. It does not own business rules or database
tables; its steps call services from `backend/chart/`.

## What the prediction job does

1. claim one saved request;
2. check whether its three climate months already exist;
3. fetch only missing months;
4. save source details and the exact three-value input;
5. call the selected place model;
6. save the result or an explicit failure.

For local testing, `ERA5_USE_FIXTURE=1` uses clearly labelled sample data.
Sample or stale data cannot pass the live data check.

## Climate sources

- completed past months: ERA5 reanalysis;
- the current supported future planning window: official C3S seasonal monthly
  data;
- near-term ECMWF AWS data: next adapter, not yet enabled;
- long-term MP scenarios: ISIMIP3b bias-adjusted daily maximum temperature,
  five-model median, March–May average for 2031–2040. The request must name
  SSP1-2.6 or SSP3-7.0.

Every saved month keeps the source URL, issue date, download time, raw-file
location and hash, area calculation version, quality, and data label.

## Run

```bash
make migrate
make lbw-run
make dagster-run
```

Dagster UI: `http://127.0.0.1:3002`.

The normal `make run` command starts both services. When Dagster is run alone,
the R prediction model must already be available at
`http://127.0.0.1:8000/health`.

## Test

```bash
python -m pytest orchestration/tests -q
python -m pytest pipelines/seasonal_c3s/tests -q
python -m pytest pipelines/isimip_projection/tests -q
```
