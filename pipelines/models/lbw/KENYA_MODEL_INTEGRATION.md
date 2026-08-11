# Kenya LBW model integration record

## Purpose and status

This document records exactly what was recovered from the modeller's shared
archive, what CHART currently derives around the model, and what would be added
to integrate the Kenya low-birth-weight (LBW) model.

**Status: investigation and modeller review only.** No Kenya model is registered,
deployed, or active. The recovered model and DHS data are intentionally excluded
from Git.

## Recovered source

| Item                          | Value                                            |
| ----------------------------- | ------------------------------------------------ |
| Original archive              | `OneDrive_2_10-08-2026.zip`                      |
| Archive size                  | 4,628,297,623 bytes                              |
| Recovered entries             | 757                                              |
| Missing or wrong-size entries | 0                                                |
| ZIP checksum result           | All entries passed                               |
| Local extraction              | `recovered/OneDrive_2_10-08-2026/` (Git-ignored) |

The archive was a valid ZIP64 archive. The initial corruption warning came from
an extractor that did not interpret the ZIP64 directory offset correctly.

## Recovered files relevant to inference

### Candidate fitted-model source

`Outputs/Report_data/Dlnm_Mod_obj_by_sem_and_Climate_Regions_KE_2026_07_31.rds`

- Size: approximately 29 MiB on disk.
- Source SHA-256:
  `a96e1ea8d1d2a8a6516ecdb74a79f4c747ef268e8a00d13f9df5f260459ba461`.
- Contents: 15 fitted model blocks: five climate zones by three pregnancy
  windows.
- Each block contains a DLNM cross-basis, fitted binomial GLM, prediction
  objects, climate exposure rows, and analysis rows.

This is the source from which a deployable artifact should be packaged. It must
not be deployed or committed unchanged because the fitted objects include model
frames and respondent-level DHS fields.

### Training and analysis data — not inference artifacts

| File                                       | Purpose                                                     | Integration decision                |
| ------------------------------------------ | ----------------------------------------------------------- | ----------------------------------- |
| `Model_files_KE_2026_07_31.rds`            | DHS-derived analysis data and nine monthly exposure columns | Never deploy or commit              |
| `All_clim_list.rds`                        | Large historical climate tables                             | Keep in controlled analysis storage |
| `data_Report.rds`                          | Reporting tables, including respondent records              | Never deploy or commit              |
| `trisem_1_data.rds` to `trisem_3_data.rds` | Plot and report objects                                     | Not used for inference              |
| `Outputs/Projected_RR/*.nc`                | Previously generated projection surfaces                    | Outputs, not model inputs           |
| `Outputs/Projected_RR_Plots/*.png`         | Previously generated figures                                | Reference material only             |

## Model blocks found

The recovered fitted artifact has models for these climate zones:

1. Central Highlands
2. Coastal Strip
3. Lake Victoria Basin & Western Highlands
4. North-eastern
5. South-eastern

Each zone has `Sem01`, `Sem02`, and `Sem03` blocks. All 15 GLMs reported
convergence and had finite temperature coefficients and covariance matrices in
the technical audit. Training-row counts ranged from 894 to 4,799. This is not
a substitute for scientific validation.

The supplied county-to-zone GeoJSON contains a sixth zone, North-western, for
Turkana. There is no fitted North-western model in the recovered artifact.
Turkana must therefore remain unsupported unless the modeller supplies and
approves that model or an explicit fallback.

There is no national Kenya model in the recovered artifact.

## Pregnancy-window mapping

The recovered training script constructs nine monthly values and slices them as
follows:

| CHART window | Recovered block | Exposure columns | Meaning                         |
| ------------ | --------------- | ---------------- | ------------------------------- |
| `1`          | `Sem01`         | 1–3              | Latest/final pregnancy window   |
| `2`          | `Sem02`         | 4–6              | Middle pregnancy window         |
| `3`          | `Sem03`         | 7–9              | Earliest/first pregnancy window |

This matches CHART's current window numbering. The modeller must confirm the
calendar alignment, especially whether column 1 includes the birth month and
whether partial months were handled as intended.

## Proposed inference input

CHART prepares exactly three county-level monthly values before calling the
statistical service:

```json
{
  "area": "South-eastern",
  "trimester": 1,
  "tmax_lag": [30.0, 29.0, 28.0],
  "model_file": "KE_climate_zone_LBW_tmax_v0.1.0.rds",
  "model_version": "0.1.0"
}
```

Input definitions:

- `area`: model climate-zone key, not the selected county name.
- `trimester`: CHART pregnancy-window identifier described above.
- `tmax_lag`: three monthly means of daily maximum 2 m air temperature in
  Celsius, newest first (`lag0`, `lag1`, `lag2`).
- `model_file` and `model_version`: proposed routing fields so the scorer selects
  the immutable release requested by CHART rather than selecting by area name
  alone.

The input climate source may be observed ERA5, a seasonal forecast, or an
approved ISIMIP3b projection. Climate acquisition and spatial aggregation stay
outside the inference service.

## Proposed inference output

```json
{
  "area": "South-eastern",
  "geography_level": "climate_zone",
  "trimester": 1,
  "tmax_lag": [30.0, 29.0, 28.0],
  "ref_temp": 24.79,
  "metric": "odds_ratio",
  "odds_ratio": 0.9903,
  "ci95_low": 0.4944,
  "ci95_high": 1.9838,
  "modelled_temperature_range_c": [19.59, 37.89],
  "on_training_support": true,
  "warning": "",
  "n_training": 1057,
  "model_file": "KE_climate_zone_LBW_tmax_v0.1.0.rds",
  "model_version": "0.1.0",
  "model_sha256": "<deployable-artifact-sha256>"
}
```

This example was calculated from the recovered South-eastern `Sem01` fitted
block using `[30, 29, 28]` °C. It is a test vector, not an approved benchmark.

The result is a conditional odds ratio relative to the model block's reference
temperature. It is not an individual probability of LBW, a causal estimate, or
a count of expected cases.

## Supplied versus derived values

The distinction below must remain visible in code review and product language.

| Value                          | Origin                                                                      | Approval needed                                              |
| ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| DLNM basis definition          | Stored in modeller's fitted cross-basis                                     | Confirm correct artifact/block                               |
| Temperature coefficients       | Stored in fitted GLM                                                        | Confirm approved final fit                                   |
| Temperature covariance matrix  | Stored in fitted GLM                                                        | Confirm approved uncertainty source                          |
| Three-month window structure   | Recovered training script                                                   | Confirm calendar semantics                                   |
| Reference temperature          | Training-data 25th percentile used by the recovered fit/prediction workflow | Confirm and freeze per zone/window                           |
| `modelled_temperature_range_c` | CHART-derived from DLNM `Boundary.knots`                                    | Confirm this is the intended support definition              |
| `on_training_support`          | CHART comparison of inputs/reference against that derived range             | Confirm warning rule                                         |
| `ci95_low` / `ci95_high`       | CHART Wald interval: `exp(log(OR) ± 1.96 × SE)`                             | Confirm Wald 95% interval is acceptable                      |
| `n_training`                   | CHART metadata derived from analysis-row count                              | Confirm whether complete-case model N should be used instead |
| Model version and SHA-256      | CHART release/deployment metadata                                           | Engineering control                                          |

`modelled_temperature_range_c`, `on_training_support`, the warning text, and the
field names were not explicitly supplied by the modeller. They are CHART
inference behavior and must be presented to the modeller for approval.

## Known issues that block activation

### Kajiado projection mismatch

The recovered GeoJSON maps Kajiado to `South-eastern`. However,
`MVP_tool_Attribution_and_Visualizations_2026_07_31.R` selects
`Lake Victoria Basin & Western Highlands_Sem02` and then applies it to a
`trimSem01` series. Existing projected NetCDF files and plots must not be used as
golden inference outputs until the modeller resolves this mismatch.

### Missing North-western model

Turkana maps to North-western, but the fitted artifact has no North-western
block. CHART must show prediction unavailable for Turkana rather than silently
substituting another zone.

### Sensitive material in the source artifact

The recovered fitted RDS contains analysis data and fitted GLM model frames with
DHS-derived fields. A sanitized bundle must be generated and verified before
deployment.

### No national model

Kenya-wide inference must remain unavailable unless the modeller supplies a
separately fitted and approved national model.

## Deployable artifact to add after approval

Proposed private artifact:

`KE_climate_zone_LBW_tmax_v0.1.0.rds`

For each of the 15 blocks it should contain only:

- stable climate-zone key and pregnancy-window key;
- DLNM variable-basis and lag-basis arguments;
- temperature coefficient vector;
- temperature covariance matrix;
- frozen reference temperature;
- frozen supported temperature range;
- complete-case training count and LBW event count;
- model family/link and exposure-unit metadata;
- provenance pointing back to the source RDS hash and modeller release note.

It must not contain respondent rows, coordinates, case identifiers, model
frames, residuals, fitted values, or the original DHS data.

The deployable artifact will receive its own SHA-256. The source RDS hash above
is provenance and must not be reused as the deployable artifact hash.

## Model release configuration to add

Proposed manifest path:

`pipelines/models/lbw/model-release.kenya.json`

Proposed shape:

```json
{
  "id": "lbw-ke-climate-zone-0.1.0",
  "module": "prediction",
  "outcome": "lbw",
  "climate_hazard": "extreme_heat",
  "health_domain": "maternal_newborn_child_health",
  "version": "0.1.0",
  "base_uri": "s3://chart-predictive-models/kenya/lbw/0.1.0",
  "temperature_input": "Three monthly means of daily maximum 2m temperature, newest first, Celsius",
  "months_required": 3,
  "model_files": [
    {
      "filename": "KE_climate_zone_LBW_tmax_v0.1.0.rds",
      "sha256": "<deployable-artifact-sha256>"
    }
  ],
  "areas": [
    {
      "place_code": "kajiado",
      "country_code": "KE",
      "level": "county",
      "model_file": "KE_climate_zone_LBW_tmax_v0.1.0.rds",
      "model_area_name": "South-eastern",
      "validated_pregnancy_windows": [1, 2, 3]
    }
  ]
}
```

The final manifest will contain one entry for every supported county. Multiple
counties may map to the same climate-zone model key. Turkana will be omitted
until a North-western model is approved.

## Planned tracked additions

No item below should be activated until the review gates are satisfied.

```text
pipelines/models/lbw/
  KENYA_MODEL_INTEGRATION.md
  model-release.kenya.json
  inference/package_kenya_model.R
  tests/test_kenya_serialization.R

pipelines/boundaries/
  data/kenya_county_climate_zone_crosswalk.csv
  manifests/kenya_model_areas_v1.json
  src/chart_boundaries/kenya_model_areas.py
  tests/test_kenya_model_areas.py

backend/chart/setup/model_configs.py
backend/chart/climate/planning_targets.py
backend/chart/inference/providers/lbw_r.py

orchestration/tests/
backend/tests/
```

Expected behavior changes:

1. Seed Kenyan county admin units and map supported counties to climate-zone
   model keys.
2. Register and activate an immutable Kenya LBW release only for supported
   counties.
3. Route inference using release identity and model filename, not area name
   alone.
4. Load the sanitized Kenya bundle in the R service alongside other approved
   releases.
5. Add an evidence-backed Kenya heat-season calendar before enabling the
   `next_heat_season` and long-term planning options.
6. Keep SSP1-2.6, SSP3-7.0, and SSP5-8.5; CHART already supports all three.
7. Add parity tests comparing the sanitized scorer against modeller-approved
   test vectors from the original fitted artifact.

No database migration is currently expected: the existing model release and
area-mapping tables can map many counties to the same model area and file. A
migration would only be needed if routing metadata is stored per release rather
than included in the inference request/service configuration.

## Modeller approval checklist

- [ ] Confirm this is the final fitted RDS intended for deployment.
- [ ] Confirm the five supported climate zones and exact spelling/stable keys.
- [ ] Resolve the missing North-western/Turkana model.
- [ ] Confirm `Sem01`, `Sem02`, and `Sem03` map to final, middle, and earliest
      pregnancy windows respectively.
- [ ] Confirm input order is newest month to oldest month.
- [ ] Confirm the exposure is monthly mean of daily maximum 2 m temperature in
      Celsius.
- [ ] Confirm county climate values may be scored using their pooled
      climate-zone curve.
- [ ] Confirm the per-block 25th-percentile reference temperature.
- [ ] Confirm DLNM boundary knots are the correct definition of model support.
- [ ] Confirm the normal/Wald 95% interval using `1.96 × SE`.
- [ ] Confirm complete-case training counts and event counts to publish as
      metadata.
- [ ] Provide approved parity test vectors for every zone and window.
- [ ] Resolve the Kajiado zone/window mismatch in the projection script.
- [ ] Confirm that outputs are conditional odds ratios and approve user-facing
      interpretation and limitations.
- [ ] Approve the sanitized bundle contents and private storage location.

## Proposed Git review sequence

1. Documentation and recovered-data exclusion only.
2. Sanitized packaging script plus proof that restricted fields are absent.
3. Kenya county/zone boundary crosswalk and validation tests.
4. Inference routing and Kenya model-release manifest, inactive by default.
5. Modeller-approved parity fixtures and tests.
6. Kenya planning calendar and climate-source tests.
7. Explicit activation commit after written approval.

Keeping these as separate commits allows the modeller to review statistical
choices independently from deployment and UI changes.
