# Vulnerability and resilience assessment (VRA)

The VRA shows, for every area in a planning frame, how vulnerable it is to
climate-health risk, which indicators drive that, and how fresh the evidence
is. Scores are relative: they compare the areas of one frame (Madhya
Pradesh's districts or divisions, Kenya's counties) with each other. The API
and validation contract is in
[`core/chart/vra/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/core/chart/vra/README.md).
The original proposal and its implementation log are archived in
`docs-internal/archive/vra-integration-plan.md`.

## How the assessment is computed (method `vra-v1`)

Framework: IPCC risk = hazard × exposure × vulnerability, with vulnerability =
sensitivity and lack of adaptive capacity (AR6). `core/chart/vra/scoring.py`
implements these steps:

| Step | Rule | Stored per run |
| --- | --- | --- |
| Comparison set | The areas of one frame; scores compare only within it | universe |
| Transform | Counts become shares or rates | transform, denominator |
| Orient | Every indicator scored so higher = worse (`direction_to_risk` +1 / −1) | direction |
| Normalise | Clip to the 5th–95th percentile of the set, then (x − lo)/(hi − lo); flip if −1. An indicator with no spread is excluded and flagged | lo, hi, n |
| Sub-index | Equal-weight mean per component; needs ≥ 2/3 of the component's weight present, weights re-normalise over what is present, else "insufficient data" | weights, coverage |
| Combine | LAC = 1 − AC; V = (S + LAC)/2; Risk = (max(H,0.01)·max(E,0.01)·max(V,0.01))^(1/3) | method version |
| Classify | Very high / High / Moderate / Low by quartile within the set | class breaks |
| Drivers | Indicators with normalised score ≥ 0.8 and the largest weighted contribution | per area |

Scoring needs at least three areas. Every run stores its bounds, weights,
inputs and hashes in `vra_run` so a result can be reproduced.

## Indicators and data

- **Catalogue:** `core/chart/vra/catalogue.json`, 72 indicators with component,
  unit, direction and how each arrives. It is synced on API start and setup.
- **Computed by CHART:** hazard indicators from the stored ERA5 data. These are
  heatwave days and mean monthly peak temperature over the latest 12 complete
  months, which need a complete twelve-month window per area. They also include
  the change in very hot and extreme hot days (TX90p / TX95p style, 2015–2024
  against 1982–2011, in `core/chart/vra/hot_days.py`), which needs ERA5 back to
  1981.
- **Uploaded:** Settings → Data → **Upload CSV**. Download a template for all
  uploadable indicators or one, validate and upload. Uploads check numbers,
  ranges, units, area membership and CSV structure; valid rows are saved with
  row-level errors for the rest. Re-uploading an area, indicator and vintage
  replaces it. A broken file saves nothing.
- **Loaded sources:** reviewed NFHS-5, Census 2011 and NITI MPI rows for Madhya
  Pradesh at district and division level, in `pipelines/vra/data/`.

## Comparison levels

The upload, template, coverage and run endpoints take `?level=district`.
Madhya Pradesh's 52 districts then form one state-wide comparison set, rather
than four to eight within each division. A division's map reads its districts
from that state-wide run; the state map shows the divisions.

## Missing data

There is no statistical imputation. The latest vintage is used and its age
shown, and a missing value is never zero. A relative score of zero is the low
end of the comparison scale, not zero risk, and zero coverage means there was
no usable input. Uploading data does not change a past assessment: run it
again after reviewing the upload.

## In the app

- **Vulnerability view:** an area map coloured by risk class, with each
  component (hazard, exposure, sensitivity, adaptive capacity) as a toggle.
- **Area drill-down:** component bars, then each indicator's raw value, unit,
  normalised score, contribution and vintage.
- **Settings → Data:** indicator coverage, CSV templates and upload, and
  **Run assessment**. Pulls and runs appear in Settings → Jobs.
