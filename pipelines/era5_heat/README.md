# era5_heat

District-scale heat metrics from Copernicus ERA5 reanalysis.

Given a district name and a lat/lon bounding box, downloads hourly
`2m_temperature` from `reanalysis-era5-single-levels` for the last N
full calendar years and produces a monthly CSV by default.

For Sprint 4 MVP evidence, use real observed ERA5 reanalysis for
**2020-2024** (`--years 5 --end-year 2024`). The default output is CSV
plus a JSON sidecar so the handoff is easy to inspect and does not
depend on Parquet tooling. The package can still run longer windows,
such as 20 years, when the modeling team needs a longer historical
exposure record.

| column | meaning |
| --- | --- |
| `district` | label from input |
| `month` | first day of month (date) |
| `tmax_monthly_max_c` | absolute maximum daily Tmax in the month |
| `tmax_monthly_mean_c` | mean of daily Tmax in the month |
| `heatwave_days` | days that belong to a run of >=3 consecutive days with Tmax >= 35 C |
| `observed_days` | daily observations available in the month |
| `expected_days` | expected number of days in the month |
| `completeness_pct` | `observed_days / expected_days` |
| `quality_flag` | `complete`, `partial`, or `empty` |
| `climate_source` | source system, e.g. Copernicus Climate Data Store or offline fixture |
| `climate_dataset` | source dataset, e.g. `reanalysis-era5-single-levels` |
| `climate_source_version` | source/version label used for handoff metadata |
| `climate_variable` | source climate variable |
| `data_status` | `observed_reanalysis` for ERA5 or `sample` for offline fixture data |
| `generated_at` | ISO timestamp for the generated output |
| `window_start_year` / `window_end_year` | historical extraction window |
| `threshold_c` / `min_run` | heatwave definition used for `heatwave_days` |

A sidecar JSON records the exact request, time window, cdsapi version,
per-year cache hits, and SHA-256 of the tabular output.

## Install

```bash
pip install -e pipelines/era5_heat[dev]
```

## CDS credentials

Get an account at https://cds.climate.copernicus.eu, accept the dataset
licence for "ERA5 hourly data on single levels", and create
`~/.cdsapirc`:

```
url: https://cds.climate.copernicus.eu/api
key: <your-personal-token>
```

For CI, set `CDSAPI_URL` and `CDSAPI_KEY` env vars instead.

## CLI

```bash
# Sprint 4 MVP observed ERA5 window:
python -m era5_heat --preset madhya-pradesh --years 5 --end-year 2024 --plot
python -m era5_heat --preset kajiado --years 5 --end-year 2024 --plot heatwave_days

# Or with a custom bbox:
python -m era5_heat \
  --district "Bengaluru Urban" \
  --bbox 13.15 77.45 12.80 77.80 \
  --years 20 \
  --outdir ../../outputs/era5_heat
```

`--bbox` order is **N W S E** (matches the CDS `area` convention).
North must be greater than south; antimeridian-crossing bboxes are
rejected.

Useful flags:

- `--preset madhya-pradesh|kajiado` — use a built-in district (auto-sets `--district` and `--bbox`).
- `--end-year YYYY` — last year to include (default: last completed calendar year).
- `--threshold-c 35.0` and `--min-run 3` — heatwave definition.
- `--plot [columns...]` — also write PNG year × month heatmaps. Pass with no value to plot all three columns.
- `--format csv|parquet` — write CSV by default. Use Parquet only with a working `pyarrow` install.
- `--no-cache` — bypass the on-disk cache.
- `--refresh` — re-download even if cached.
- `-v` — verbose logging.

### Preset bounding boxes

| slug | district | country | bbox (N, W, S, E) |
| --- | --- | --- | --- |
| `madhya-pradesh` | Madhya Pradesh | India | (26.87, 74.02, 21.08, 82.84) |
| `kajiado` | Kajiado | Kenya | (-1.00, 36.05, -3.10, 37.95) |

### MVP geography definitions

| slug | MVP admin level | Boundary source/format | Notes |
| --- | --- | --- | --- |
| `madhya-pradesh` | ADM1 / India state | Manually defined WGS84 lat/lon bounding box in CDS order: north, west, south, east | Chosen because Sprint 4 user engagement is with Madhya Pradesh state health officials. |
| `kajiado` | ADM1 / Kenya county | Manually defined WGS84 lat/lon bounding box in CDS order: north, west, south, east | Chosen because Kenya engagement is organized around county health planning. |

The MVP uses bounding boxes for ERA5 extraction because they are simple
and match the Copernicus CDS `area` request format. They are approximate:
a bbox includes grid cells outside the exact administrative polygon. A
later version should use official GeoJSON/shapefile boundaries and
polygon masking if the team needs district, facility-catchment, or
official cartographic precision.

## Python API

```python
from era5_heat import compute_heat_series, fixture_demo, PRESETS
from era5_heat.viz import monthly_heatmap

# Real ERA5 (requires CDS credentials):
preset = PRESETS["madhya-pradesh"]
df, meta = compute_heat_series(district=preset.name, bbox=preset.bbox, years=20)

# Or an offline fixture, for previewing the chart shape without credentials:
df, meta = fixture_demo("madhya-pradesh", years=20, end_year=2024)

fig = monthly_heatmap(df, value="heatwave_days", title="Madhya Pradesh")
fig.savefig("mp.png")
```

## Notebooks

`notebooks/mvp_data_explorer.ipynb` is the focused Sprint 4 notebook for
checking the real 2020-2024 ERA5 handoff shape before wiring climate
data into CHART.

`notebooks/explore.ipynb` is a longer EDA notebook for both focus
districts (Madhya Pradesh, Kajiado) with seaborn visualizations and
year × month heatmaps for monthly Tmax and heatwave-day counts.
Offline fixture data remains available for tests and offline preview, but
Sprint 4 evidence should use `data_status = observed_reanalysis`.

```bash
pip install -e "pipelines/era5_heat[notebook]"
jupyter lab pipelines/era5_heat/notebooks/mvp_data_explorer.ipynb
```

## Caching

NetCDF downloads are keyed by `sha256({dataset, variable, year, area})`
and stored in `pipelines/era5_heat/.cache/`. Re-runs hit the cache and
finish in seconds. Override the location with `cache_dir=` or
`--cache-dir`.

## Tests

```bash
PYTHONPATH=pipelines/era5_heat/src python -m pytest pipelines/era5_heat/tests/
```

The unit tests use deterministic in-memory/offline fixtures and do not
call the CDS. If `outputs/era5_heat/*_2020_2024.csv` exists locally,
the test suite also validates those generated observed ERA5 outputs.

## Caveats

- "Last N years" means full calendar years ending at the last completed
  year, not a rolling window. This avoids mixing the ERA5T preliminary
  stream at the tail and keeps runs reproducible.
- ERA5 single-levels is 0.25 deg (~28 km). For very small bboxes a
  single grid cell may dominate; consider ERA5-Land (0.1 deg) if higher
  spatial detail matters.
- Heatwave runs that cross the 20-year window edge are undercounted by
  the missing 1-2 days outside the window.
