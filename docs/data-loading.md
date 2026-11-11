# Data loading

How CHART's data gets in, where each kind is kept, how big it is, and how to
load, check and rebuild it. Sizes are measured on the AWS sandbox unless marked
≈ (an estimate until pulled). Method details live with each dataset:
[observed climate](observed-climate.md), [data pipeline](data-pipeline.md),
[Explore](explore.md) (forecasts, population) and the
[VRA module](https://github.com/CHART-Scope/CHART/blob/dev/core/chart/vra/README.md).

## Where data is kept

Three tiers, each holding what it is best at. An installation needs only the
first and the last; the public mirror is optional and needs no account.

| Tier | Holds | Where | Configure |
| --- | --- | --- | --- |
| Downloads | Copernicus grids exactly as received (ERA5, ERA5-Land, C3S), each beside a request sidecar | Local disk (`ERA5_CACHE_DIR`, default `pipelines/era5_heat/.cache`) | nothing; works offline once filled |
| Public mirror | The same grids, shared so other installations skip the Copernicus queue | `https://chart-predictive-models.s3.eu-north-1.amazonaws.com/era5-cache` (public read) | `ERA5_MIRROR_URL`; empty turns it off |
| Serving | What the app reads: daily and monthly climate per place, predictions, indicator values, results | PostgreSQL / PostGIS | `DATABASE_URL` |

The downloader looks for a grid in the local folder, then the mirror, then
asks Copernicus. A grid fetched from the mirror is validated and cached
locally like a fresh download, so its provenance does not change. Nobody needs
CHART's credentials: reading the mirror is anonymous, and an installation that
keeps its own copy elsewhere points `ERA5_CACHE_DIR` or `ERA5_MIRROR_URL` at it.

ERA5, ERA5-Land and C3S are Copernicus data under the Copernicus licence,
which permits redistribution with attribution: "Contains modified Copernicus
Climate Change Service information".

## Dataset register

| Dataset | Feeds | Pull | Size per pull | Kept | Load | Rebuild without downloading |
| --- | --- | --- | --- | --- | --- | --- |
| ERA5 2 m temperature, hourly → daily and monthly per place, 1981–present | health models, heatwave and hot-day indicators | recurring, monthly (Dagster `recent_climate_months_sensor`); history by backfill | about 20 MB (MP) and 29 MB (Kenya) per year | downloads + mirror; daily and monthly rows in Postgres | `make climate-backfill COUNTRY=IN YEARS=45` | rerun the backfill: every grid comes from the local folder or the mirror |
| ERA5-Land, hourly → monthly per place, 2006–present | Explore temperature and heatwave layers | backfill, then monthly | about 72 MB per country per year (one request per month) | downloads + mirror; monthly rows | `make climate-backfill COUNTRY=KE YEARS=20 PRODUCT=era5-land` | as above |
| C3S multi-system seasonal forecast (Tmax anomalies, nine centres) | Explore next six months | recurring, monthly (Dagster `seasonal_forecast_sensor` checks daily) | 0.5 MB per issue | downloads; scored result as JSON under `MODEL_CACHE_DIR/forecasts` | `python -m chart.climate.seasonal_forecast build --country KE` | rerun `build`: 2 min (India), about 12 min (Kenya) |
| ISIMIP3b Tmax projections (SSP1-2.6, 3-7.0, 5-8.5) | Explore projections | one-off per release | held | outlook files | model release process ([model integration](model-integration.md)) | from the release files |
| WorldPop 2025, 1 km | population layer, exposure | one-off per release | done | `core/chart/population/worldpop_2025.json` | `core/scripts/worldpop_population.py` | rerun the script |
| NFHS-5, Census 2011, NITI MPI (MP districts and divisions) | 25 VRA indicators | one-off per survey round | under 1 MB | VRA indicator values | VRA upload with `?level=district` ([VRA module](https://github.com/CHART-Scope/CHART/blob/dev/core/chart/vra/README.md)) | re-upload the committed CSV |

Planned, in the order they are likely to be pulled:

| Dataset | Feeds | Pull | Size (≈) |
| --- | --- | --- | --- |
| Daily minimum temperature (same ERA5 downloads) | warm nights, extreme warm nights | none: re-derived from the cache | 0 |
| ERA5 2 m dewpoint, 2015 onwards | heat index days, heat-stress days | one-off, then monthly | ≈0.5 GB |
| Rainfall: IMD gridded (India), CHIRPS v3 (Kenya) | heavy-rain days, maximum 24-hour rain, drought | one-off, then monthly | ≈1.5–3 GB |
| ISIMIP3b SSP2-4.5, minimum temperature, rainfall | projected hot days, warm nights, heavy rain | one-off per release | ≈0.5–1 GB |
| OpenStreetMap, Ookla tiles, ESA WorldCover, Hansen forest change | road density, connectivity, green space, forest change | quarterly or yearly | ≈4–6 GB in total |
| NFHS-6 district fact sheets; Kenya DHS 2022 county tables | updated health and capacity indicators | each survey round | under 200 MB |

New hazard indicators are stored as monthly or yearly counts per place, not as
new daily rows: they are what the assessment reads, and they keep the database
small.

## Capacity on the sandbox (6 November 2026)

| Item | Size |
| --- | --- |
| Server disk | 96 GB, 33% used (65 GB free) |
| Database | 2.9 GB, of which daily climate 2.0 GB (6.7 M rows, about 290 bytes a row with indexes) and monthly climate 0.46 GB |
| Local download folder | 0.5 MB (seasonal forecasts only); every ERA5 and ERA5-Land grid is in the mirror |
| Public mirror | 1,205 files, 6.56 GB |
| Docker images | 10 in use, 6.7 GB |

Before a pull larger than a few gigabytes, measure one year, multiply it out
and check it against the free disk and database growth. The climate pulls stop
with `CLIMATE_STORAGE_CAPACITY_LOW` when the output or download folder has
less than `CLIMATE_MIN_FREE_BYTES` free (default 1 GiB).

## Runbooks

**Backfill climate history.** `make climate-backfill COUNTRY=KE YEARS=45`
(add `PRODUCT=era5-land` for the map layer). It pulls two years per round,
derives every configured place and stores each round; rerunning it skips what
is held. `make climate-verify` with the same arguments lists any place or
month missing. On the sandbox the 1981–2005 extension took 23.4 h for Madhya
Pradesh and 17.8 h for Kenya, side by side, and added 1.2 GB of downloads and
1.47 GB of database ([measurements](observed-climate.md#measured-on-the-sandbox)).

**Resume a failed backfill.** Run the same command again. Completed rounds are
kept; downloads already in the folder or the mirror are not requested again.

**Re-derive from the downloads.** A change to how places are derived (a new
threshold, a new variable) does not need Copernicus: rerunning the pull for
the affected years reads the cached grids. Kenya's heatwave days for
constituencies were re-derived this way for 2006–2017 in 1.6 h.

**Publish to the mirror.** Maintainers with write access to the bucket's
`era5-cache/` folder (the sandbox's `chart-sandbox` instance role has exactly
that) run `make climate-mirror-publish ERA5_CACHE_DIR=<download folder>`, or
`aws s3 sync <folder> s3://chart-predictive-models/era5-cache/ --exclude "*.partial" --exclude ".*"`
on the server. The first publish took 91 seconds for 6.56 GB.

**Free the server disk.** Once a folder is in the mirror, its local copies can
go: the downloader fetches any grid back in under a second. Old Docker images
from earlier deploys accumulate: `docker image prune -a` removes those no
container uses (54 GB on 6 November); older releases can be pulled again from
the registry.

**Deploying during a load.** A deploy restarts the app services. Run long
backfills and rebuilds when no deploy is due, and check `docker ps` for
running `chart-dagster-code-run-*` jobs before deploying.
