# VRA module

The vulnerability and resilience assessment scores the child areas of a frame
geography (a state's divisions, a country's counties) on hazard, exposure,
sensitivity and adaptive capacity, and combines them into a risk score with a
class, a rank and the indicators that drive it. Design, sources and open
questions: [docs/vra-integration-plan.md](../../../docs/vra-integration-plan.md).

| File                      | Role                                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogue.json`          | Every indicator: component, unit, direction relative to risk (+1 more is worse), route (computed, upload, manual, pull), status (included, context, dropped), rationale and CEEW sheet reference. Synced into `vra_indicator` on API start, at setup, and on first use. |
| `scoring.py`              | The `vra-v1` method as pure functions (no FastAPI, Dagster or database).                                                                                                                                                                                                |
| `service.py`              | Frame and areas, CSV validation and upserts, hazard computed from `district_climate`, runs, reads.                                                                                                                                                                      |
| `routes.py`, `schemas.py` | Thin `/vra/...` endpoints and their response shapes.                                                                                                                                                                                                                    |

## Method (`vra-v1`)

1. Universe: the frame's child areas, framed like the dashboard map (a leaf
   is framed on its siblings).
2. For each included indicator with values in at least 3 areas: clip to the
   5th-95th percentile across the universe (linear interpolation), scale to
   0-1 and flip when direction is -1, so every score points towards risk. An
   indicator with no spread, too few areas or no data is excluded with that
   reason.
3. Component = equal-weight mean of the area's indicator scores, if it has at
   least two thirds of the component's scoreable indicators; otherwise null.
   The adaptive-capacity mean is the lack of capacity (LAC); the component is
   reported as capacity, AC = 1 - LAC.
4. Vulnerability = mean of sensitivity and LAC (whichever exist). Risk =
   (max(H, .01) * max(E, .01) * max(V, .01))^(1/3), null if H, E or V is
   null (`missing_reason = insufficient_data`).
5. Classes are quartiles of the scored areas' risk (low, moderate, high,
   very_high); rank 1 is the highest risk. Drivers are up to three indicators
   scoring at least 0.8, largest contribution first.

Each run stores its parameters, per-indicator bounds, class breaks, an input
hash (indicator directions plus every value and vintage used) and an output
hash, so the same inputs reproduce the same output hash.

## Values

- Uploads: `POST /vra/{geography_id}/values` with the template columns
  (`area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes`).
  Rows are checked one by one; valid rows upsert on (indicator, area, vintage).
  A file with no valid row is recorded as failed and writes nothing.
  Percentages must be 0-100, in the catalogue unit.
- Computed hazard: each run recomputes `haz.heatwave_days_12m` (sum of
  monthly `heatwave_days`) and `haz.tmax_monthly_max_12m` (mean of
  `tmax_monthly_max_c`) over the 12 months ending at the latest complete
  observed ERA5 month in the frame. Sample data is ignored; an area missing
  any month of the window gets no value. Values reference their `climate_run`.
- Scoring uses the newest vintage per indicator and area. Missing values are
  never filled or treated as zero.

## Endpoints

Readers (risk reader roles and geography scope): `GET /vra/indicators`,
`GET /vra/{geography_id}/assessment`, `/map`, `/areas/{area_geography_id}`.
Administrators (`chart_admin` and scope): `GET /vra/{geography_id}/coverage`,
`/template.csv`, `POST /vra/{geography_id}/values`, `POST /vra/{geography_id}/runs`.

E2E coverage: `core/tests/test_vra_api.py` (part of `make e2e-core`).
