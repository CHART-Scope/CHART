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

- Uploads: `POST /vra/{geography_id}/values` accepts UTF-8 CSV (at most 2 MB).
  The original eight columns remain supported:
  `area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes`.
  Only `area_code,indicator_code,value,vintage` are required. Blank values are
  skipped, never converted to zero. Valid rows upsert on (indicator, area,
  vintage), so corrected files can be uploaded again. A mixed file saves valid
  rows and reports rejected physical line numbers; a file with no accepted
  rows records a failed ingestion and writes no indicator values. Uploading
  does not refresh the saved assessment: run the assessment after reviewing
  the import result.
- Settings → Data provides one **Upload CSV** dialog: select all indicators or
  one indicator, preview its fields and value rules, optionally download the
  template, then choose a file and explicitly **Validate and upload**. File
  selection alone sends nothing. Results and corrections stay in the dialog.
  The upload accepts the same optional `indicator_code` query as the template.
  When selected, nonblank rows for other indicators are rejected; valid matching
  rows still save. Unknown, computed or dropped selections return
  `VRA_TEMPLATE_INDICATOR_INVALID` before any writes. Omitting the query permits
  all uploadable indicators. This is validation and import in one request, not
  a separate dry-run operation.
- Each entry in `catalogue.json` has a `value_schema` (numeric type, inclusive
  bounds, illustrative example and expected-value text). The catalogue and
  coverage APIs expose the same rules used for validation. Proportions use
  0–100, binary fields use 0/1, true counts are nonnegative integers, while
  averaged event rates may be fractional. Changes and temperatures can be
  signed; groundwater extraction stage can exceed 100%. All values must be
  finite. Rules are packaged with the catalogue and require no new DB schema.
- The template adds `indicator_name,unit,expected_values,example_value` as
  guidance columns. Actual `value` and `vintage` stay blank: examples are not
  observations. Download all uploadable indicators, or filter with
  `GET /vra/{geography_id}/template.csv?indicator_code=...`. Computed and
  dropped indicators cannot be uploaded. A supplied nonblank `unit` must
  match the catalogue; the other guidance columns do not become observations.
- Invalid/missing/duplicate headers and unrecoverable CSV quoting errors
  reject the entire file before any value or ingestion write. Quoting errors
  return `VRA_CSV_INVALID` with the physical line number; fix the file and retry.
  Wrong column counts, unknown/out-of-frame area codes, unknown indicators,
  duplicate keys within a file, invalid values and incompatible units return
  actionable errors. Validation checks structure and numeric rules, not the
  truth of a source, its denominator or its boundary crosswalk. Those still
  require review before import.
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
Every geography-scoped route checks access to both the requested geography
and its resolved comparison frame. A leaf URL cannot widen a reader's scope
to its parent or siblings. Existing country-scoped administrator policy is
unchanged.

## Reading missing values and zero scores

Missing raw values are shown as **Missing**, absent scores as **Not scored**,
and zero scoreable coverage as **No usable data**. Raw data can exist but be
excluded because too few comparison areas have values or there is no spread.
A recorded zero remains zero.
A relative indicator score of zero can also correspond to a positive raw
value: it is the lower end of the risk-oriented comparison scale, not proof
of no underlying risk. Small positive values are displayed without rounding
them to zero. Scores describe the saved run; coverage describes available
inputs, so importing new data requires a new run to update scores.

Verification: `make e2e` includes live CSV upload and assessment regressions
against real Keycloak, HTTP, PostGIS and browser boundaries in root `e2e/`.
Existing `core/tests/test_vra_api.py` remains compatibility coverage.
