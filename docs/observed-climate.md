# Observed climate data

CHART shows observed months (what heat did to health in a past month) from
stored data only. Nothing is downloaded or scored when someone opens a place,
changes the month, the pregnancy window or the outcome. This page describes how
the data gets there, how long it takes and how much space it needs.

## Architecture

```text
Copernicus CDS (ERA5 hourly 2 m temperature)
      │  one request per country and calendar year
      ▼
ERA5 cache (raw NetCDF, on the climate volume)  ◄──  public mirror (S3 era5-cache/)
      │  derive every configured place: cell-centre or cell-overlap weights
      ▼
PostgreSQL  district_climate (monthly)  +  district_climate_day (daily)
      │  India: score every live-model area, month and pregnancy window (R)
      ▼
PostgreSQL  prediction_result
      │  read only
      ▼
API  /heat-outlook/{place}/observed  and  /observed/map
      │
      ▼
Dashboard: one observed view for India and Kenya
```

- **Places** come from the published model configuration
  (`MODEL_CACHE_DIR/outlooks/index.json`), the same list the dashboard's pickers
  offer: for India, Madhya Pradesh, its 10 divisions and 52 districts (63
  places); for Kenya, the country, 47 counties and 289 constituencies (337
  places). A place outside the configuration is never downloaded.
- **Kenya's counties** are scored when read, by the calibrated DLNM, from the
  stored monthly and daily climate. **India's** divisions and state are scored
  once, when their months are loaded, for every validated pregnancy window; the
  dashboard offers the windows Settings leaves on. Districts and constituencies
  hold climate but have no fitted observed model, so their observed estimate
  shows as unavailable.
- **New months** arrive by the six-hourly top-up sensor, which pulls and scores
  the newest published ERA5 months (see [Data pipeline](data-pipeline.md)).

## Loading history

Run once per country, then again with more years whenever needed; a re-run only
downloads the years it adds.

```bash
make climate-backfill COUNTRY=IN YEARS=2     # local
make climate-verify   COUNTRY=IN YEARS=2     # lists any place-month missing
```

On the sandbox, run it in a one-off container so a deployment cannot interrupt
it (`docker compose run` containers are not replaced by `up -d`):

```bash
cd ~/chart-deploy/aws
docker compose --env-file .env.prod run --rm --no-deps -T chart-dagster-code \
  python -m chart.climate.history backfill --country IN --years 20
docker compose --env-file .env.prod run --rm --no-deps -T chart-dagster-code \
  python -m chart.climate.history score --country IN --years 20
```

`score` re-scores stored months only (for example after a model release or a
change of validated windows). New installations default to **2 years for one
country** (India) to try CHART; the sandbox keeps **20 years** for both.

## Measured on the sandbox

Measured on 30 October 2026 on the sandbox (EC2, 2 vCPU, 7.6 GB RAM), India and
Kenya running side by side. Copernicus queue time dominates and varies with
load: one two-year round took between 50 seconds and 28 minutes.

| History | Months | Wall time added (per country, both in parallel) | ERA5 cache | Database | Daily climate rows |
|---|---|---|---|---|---|
| none | – | – | 38 MB | 83 MB | 60 k |
| 2 years | 33 | 28 min (India, including scoring) | 168 MB | 224 MB | 0.46 M |
| 5 years | 69 | 45–60 min more | 316 MB | 367 MB | 0.90 M |
| 10 years | 129 | 95 min more | 560 MB | 606 MB | 1.63 M |
| 20 years | 249 | see below | see below | see below | see below |

- Raw ERA5 per year: about **20 MB** for Madhya Pradesh and **29 MB** for Kenya.
- Database: about **290 bytes per daily row** including indexes; 400 places
  produce about 146,000 daily rows per year.
- India scoring: 21 area-outcomes (10 divisions and the state for LBW across
  their validated windows, 10 divisions for under-five), about **0.3 s per
  stored result**; five years took 7.5 minutes.
- While a backfill runs, both CPUs are busy deriving places from each year's
  grid. The site stayed responsive (HTTP 200 in under 0.1 s), but SSH sessions
  occasionally timed out; run long loads outside working hours.

## Sharing the downloads

A maintainer with bucket write access can publish the retained grids so other
installations skip the Copernicus queue entirely:

```bash
make climate-mirror-publish ERA5_CACHE_DIR=<copy of /opt/chart/data/climate/era5-cache>
```

The downloader reads `ERA5_MIRROR_URL` (default
`https://chart-predictive-models.s3.eu-west-2.amazonaws.com/era5-cache`) before
Copernicus. Mirrored files keep their cache keys and request sidecars, so
provenance is unchanged. ERA5 is Copernicus data under the Copernicus licence,
which permits redistribution with attribution.
