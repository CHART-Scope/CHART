# Spatial risk map: proposed architecture

Status: recommendation following inspection on 2026-09-08; no application code changed.

## Decision

Extend CHART's existing versioned place sets, boundary loader, and model mappings.
Keep three independent concepts: geographical shapes, model coverage, and spatial
results. A model release references a place-set version; a result references its
actual spatial support and model release. The browser joins shapes and values by
stable identifiers and renders them. It does not calculate health risk.

The supplied screenshots are design references, not evidence for their displayed
percentages, temperatures, historical period, or spatial resolution.

## What the supplied files contain

| File | Features | Meaning |
| --- | ---: | --- |
| gadm41_IND_1.json | 41 | India ADM1 features in this artifact |
| gadm41_IND_2.json | 676 | India ADM2 features; 51 within MadhyaPradesh |
| gadm41_KEN_1.json | 47 | Kenya counties |
| gadm41_KEN_1 (1).json | 47 | Byte-identical copy of the other Kenya file |

All four are GeoJSON FeatureCollections containing MultiPolygons, with a declared
CRS84 coordinate system. Coordinates use longitude then latitude in degrees.
The coordinate convention is shared; each geographical area has different
coordinates. Outcome changes reuse boundaries. Boundary-source/version changes
can change coordinates and must be recorded explicitly.

These are GeoJSON files, not multi-file ESRI shapefile packages. They contain
administrative attributes and boundaries, but no risk values or analytical grid.
Use GID_1/GID_2 as source identifiers and explicit crosswalks to CHART place codes.
Do not join by display name: this dataset spells Madhya Pradesh `MadhyaPradesh`.
Dhar is `IND.19.16_1`, under `IND.19_1`. Treat these IDs as source/version scoped.

Both Kenya files have SHA-256
`2cf6bb44c7939bf9f7f376c095b4fb69827d5bcf7f95223cf594e6796880c333`.
Canonical JSON comparison of geometry objects found exact matches for all 47
counties against CHART's existing
`pipelines/boundaries/data/kenya_counties_climate_zones.geojson`.
Reuse that normalized artifact and its existing place identities.

The shared MP place set contains ten modeller-supplied divisions and a unioned
state shape. The legacy boundary manifest instead describes a 52-district source
and a 55-district administrative crosswalk. The supplied GADM file's 51 districts
are a third representation: do not overwrite either existing analytical shape
set or assume that these district boundaries match the model's training vintage.
This inspection establishes structure and exact Kenya equality, not a complete
topology/validity audit or MP boundary equivalence.

## Existing foundations to reuse

- `pipelines/places/`: immutable place sets with hierarchy, shape artifact,
  checksum, and provenance.
- `backend/chart/model_registry/place_sets.py`: shared place-set resolution,
  artifact verification, and model-coverage validation. Schema-2 support exists;
  the inspected MP and Kenya review manifests still use embedded geography.
- `backend/chart/geographies/load.py`: imports normalized shapes into AdminUnit,
  preserving boundary provenance/version and PostGIS geometry.
- `ModelAreaMapping`: separates administrative identity from fitted model scope.
  For example, a Kenya county can map to a climate-zone model.
- `backend/chart/climate/what_if.py`: existing synchronous scoring without climate
  ingestion, Dagster, or persisted batch results. This is a what-if calculation,
  not a substitute for historical spatial inputs.

The current geography HTTP response provides identities and model coverage, not
map geometry. The inspected dashboard has no spatial risk-map renderer.

## Spatial layers and contracts

1. **Boundary layer:** place-set ID/version, shape checksum, GeoJSON feature ID,
   CHART geography ID, parent ID, administrative label, bounds, source identity.
   Preserve full geometry for analysis; create a separately checksummed display
   derivative if simplification is needed. Simplifying display must not change
   climate extraction. Preserve shared borders when simplifying neighbours.
2. **Model coverage:** release ID/outcome, supported place IDs, fitted model-area
   IDs, and disclosed inherited scope. A district outline does not establish that
   a district-specific model exists. Retain unsupported areas on maps as no data.
3. **Spatial result:** dataset ID/version, result kind (historical, forecast, or
   what-if), outcome, metric, units, period, scenario where applicable, model
   release, input hash, spatial-support ID/version, values keyed by feature ID,
   missing-data reasons, and optional uncertainty. An imported published result
   without a CHART model release must identify its external model/source instead.

Spatial support is either an administrative place set or a separately versioned
grid. Grid metadata must describe its CRS, cell IDs, origin/resolution or explicit
cell polygons, and clipping/masking method. Avoid raster infrastructure initially:
a small grid can be served as GeoJSON cells. Revisit transport after measuring
real payload sizes and rendering performance.

The screenshot shows a **grid value layer with administrative outlines**. Filling
district polygons is a useful alternative, but does not reproduce that grid.
Rendering square cells from a district value would imply unsupported spatial
detail. Require real cell-level outputs before enabling the screenshot's grid.

Selecting a district should retrieve an independently supplied or approved
district summary. Do not average cell percentages blindly. The aggregation
contract must define the appropriate denominators/weights and missing coverage.
If no valid district summary exists, show that state rather than a fabricated
percentage. A click on a cell and selection of a district are distinct actions.

## Backend and frontend ownership

Extend `backend/chart/geographies/{schemas,service,routes}.py` with a bounded,
versioned boundary read. Keep analytical map reads near existing climate result
services; introduce a focused module only when implementation size warrants it.
Proposed endpoints, not existing routes:

- `GET /geographies/{id}/boundaries?place_set_version=...&level=...`
- `GET /climate/spatial-results/{dataset_id}` with scoped, bounded selection
  filters when needed.

Boundary responses declare their exact version and feature IDs. Result responses
declare matching spatial support, metric semantics, legend intervals and values.
Cache public boundaries by immutable artifact identity. Apply role/geography
authorization to protected results and summary reads; never share a scoped
response through an unscoped cache. Public licensed boundaries need not require
login. Use explicit unavailable/mismatch errors.

Put a reusable `RiskMap` and its legend/selection panel under
`web/src/features/dashboard/`, with a thin client in `web/src/lib/`. Start with
an SVG thematic map appropriate to this fixed card: one shared projection for
outlines and data, fit-to-bounds, accessible feature selection, keyboard support,
and a table/list alternative. No basemap is needed for the supplied design.
Choose any projection dependency during implementation based on correctness
and payload needs; do not hand-roll GIS transformations.

Country labels, parent hierarchy, supported outcomes, and fitted scope come from
configuration. Colours and typography belong to the frontend design system;
metric units, classification boundaries, period, and data availability belong to
the result contract. Define exact interval edges so 5%, 10%, and 15% are unambiguous.
Missing values must look different from zero. Protect against stale responses
when changing outcome or geography, and reset invalid selections.

## Results without pipelines

Support a validated import of a versioned result bundle from the modelling team:
manifest, values, spatial support reference (or grid artifact), and summaries.
Validate keys, units, coverage, hashes, and model provenance, then publish through
the same read service used for computed results. An import command can run
manually; it does not require Dagster. Store metadata and bounded administrative
values in Postgres, with immutable files for larger grid artifacts if needed.

For fresh computation with already available inputs, call the existing backend
scoring adapter synchronously within a bounded workload. The model's declared
input contract remains authoritative; do not manufacture missing exposures.
Larger ingestion/computation retains the existing Postgres request and Dagster
execution path. Both producers should emit the same spatial-result contract.
Qwen explanations remain optional and cannot gate numeric results or maps.

## Implementation order

1. Agree with the modelling team on one sample spatial-result bundle: whether
   the squares are genuine output cells, grid metadata, metric definition, period,
   model provenance, and the district-summary calculation. The supplied shape
   files alone cannot establish these facts.
2. Reuse Kenya's existing shapes. Prepare a new MP district display place set
   only after crosswalking its boundary vintage to the model-supplied geography.
   Keep display overlays distinct from analytical extraction shapes.
3. Add versioned boundary and result reads plus a manually imported fixture.
   Build the map card with outcome switching, selection, legend, and no-data
   states. Clearly mark development fixtures as illustrative.
4. Connect one approved real dataset, then connect pipeline production to the
   same contract. Migrate model manifests to shared place-set references as
   separately tested release changes; preserve old result identities.
5. Remove superseded import/configuration paths only after consumer inventory
   and parity checks. There is no reason to delete current prediction or
   orchestration code to implement this design.

Validate geometry/IDs/parent relationships, exact shape-result joins, no-data
coverage, boundary-version mismatches, and authorized/denied result access.
Test new routes with FastAPI TestClient, including role/geography denial for
protected routes. Run backend and orchestration test suites for Python changes;
run web build and typecheck for UI changes, and format-check for broad changes.
No implementation tests were run for this design-only note.

## Findings from the complete MP modelling folder

The corrected folder is a complete modelling project, not just a shape bundle. It
contains the original fitted RDS objects, R scripts, DHS/Stata subsets, daily and
monthly climate rasters, administrative shapes, and projected relative-risk
NetCDF outputs. The key fitted files are:

- `Outputs/Report_data/Dlnlm_Objs.rds`: one MP-wide fitted model;
- `Outputs/Report_data/Dlnm_Mod_obj_by_sem_and_Division_MP_2026_07_05.rds`:
  ten divisions × three pregnancy windows, with original `glm`, crossbasis and
  prediction objects;
- `Outputs/Report_data/trisem_1_data.rds`, `trisem_2_data.rds`, and
  `trisem_3_data.rds`: report tables and curves, not spatial cell results.

The CHART compact RDS is numerically faithful to these supplied fits for all 31
blocks: its temperature-only coefficients and covariance matrices equal the
corresponding `predCross_*` objects. The full original `glm` coefficients are
longer because they include adjustment covariates; compact extraction correctly
retains only the temperature basis terms needed at inference time. The compact
artifact checksum also matches its manifest.

The original modelling script has a serious spatial attribution issue. Before
the spatial loop it selects `reducedCrossPred_Gwalior_Sem03`, then assigns that
one coefficient/covariance pair to every cell. It therefore applies Gwalior's
third-window exposure-response curve across the whole MP grid. It does not
dispatch cells to Bhopal, Chambal, Gwalior, Indore, Jabalpur, Narmadapuram, Rewa,
Sagar, Shahdol, or Ujjain model blocks. This is unsuitable as the production
division map without modeller review and correction.

The spatial outputs are relative risk (`RR`) NetCDFs, not attributable fraction
percentages. The script computes a pixel-level three-month seasonal-window RR
against that pixel's 1980–2010 baseline temperature, then derives annual means
with CDO. The output grid is 0.5° cells (16 × 22), dates 2020–2100, with five
GCMs and SSP126/370/585 scenarios. This is a projection layer, not the screenshot's
2007–2021 historical map. Converting RR to attributable fraction is only valid
when the desired estimand and denominator are explicitly agreed; the script's
`(RR-1)/RR` expression is a positive-excess transformation and should not be
labelled as observed case percentages without additional case counts/denominators.

The correct import boundary for these outputs is therefore: preserve each
NetCDF's grid metadata, GCM, scenario, window, baseline period, model block and
source script revision; expose it as a projection/RR layer; keep it separate from
the compact model's administrative what-if and prediction responses. Do not
present these files as the screenshot's map until the model dispatch bug and
metric semantics are resolved.

## Minimal first spatial-result layer

For component design, start with one small read-only result contract. It should
not expose the original RDS objects, climate rasters, or modelling scripts to the
browser:

```json
{
  "dataset_id": "mp-lbw-rr-2020-2100-gfdl-ssp126-monthly-v1",
  "country_code": "IN",
  "geography_id": "geo-in-madhya-pradesh",
  "place_set": {"id": "in-mp-v1", "version": "1"},
  "outcome": "lbw",
  "metric": "relative_risk",
  "unit": "odds_ratio",
  "period": {"start": "2020-01", "end": "2100-12", "frequency": "monthly"},
  "scenario": "ssp126",
  "climate_model": "gfdl-esm4",
  "pregnancy_window": 3,
  "baseline": {"start": "1980", "end": "2010", "method": "same_cell_mean"},
  "model_release_id": "lbw-mp-1.0.1-compact-review",
  "grid": {"crs": "EPSG:4326", "resolution_degrees": 0.5, "cell_id_scheme": "row_col"},
  "values_uri": "...immutable artifact or API resource...",
  "values_sha256": "...",
  "legend": {"type": "continuous", "domain": [0.7, 6.8]},
  "status": "review"
}
```

The browser needs only the contract, a bounded set of cell values, and the
boundary overlay. The first `RiskMap` component should consume a normalized
array such as `{cellId, value, geometry}` plus the contract metadata. It should
support loading, no data, error, legend, outcome/window/scenario selection, and
clicking a cell. A separate division overlay can show the CHART place boundary;
it must not imply that the cell was fitted with a division-specific model.

Keep attributable fraction out of this first transport contract until the
denominator is defined. If approved later, add it as a second named metric with
its own unit and derivation metadata; never silently relabel relative risk.

The first integration can use one checked GFDL/SSP126 monthly fixture and one
division boundary. Once the component contract is stable, add the remaining
four GCMs, three SSPs, annual aggregation, and corrected division dispatch.
This keeps the UI work small while leaving the climate prediction modules free to
produce the same result shape through synchronous or Dagster-backed paths.

## Source conventions and publication

GeoJSON coordinate conventions follow
[RFC 7946](https://www.rfc-editor.org/rfc/rfc7946).
The import should normalize the legacy `crs` member into the canonical contract
after checking it, preserving original source bytes separately.

Record permission for the intended distribution of each boundary artifact.
[GADM's terms](https://gadm.org/license.html) distinguish academic/non-commercial
use from redistribution and commercial use, which require prior permission.
This matters before serving downloadable GADM-derived boundaries publicly;
the current place sets already mark their source licences for review.
