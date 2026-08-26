# Modeling

CHART's current fitted health models estimate temperature associations with
low birth weight (LBW) in Madhya Pradesh and Kenya, and under-five mortality
in Madhya Pradesh.

The current model is an **inference demo around already fitted R models**. It
does not train a new model, download climate data, forecast weather, or estimate
an individual baby's probability of low birth weight.

## Current modeling status

All three releases use **Distributed Lag Non-linear Model (DLNM)** terms. A
DLNM represents a non-linear temperature-response relationship while also
representing effects across several preceding time intervals. The releases do
not share one interchangeable input contract.

| Release | Fitted geography | DLNM design | Runtime temperature input |
|---|---|---|---|
| Madhya Pradesh LBW | One supplied MP-wide block and 10 divisions | Binomial logistic DLNM; MP-wide block verified for window 1, divisions fitted for three windows | Three monthly means, newest first |
| Kenya LBW | Five climate-zone blocks used by 46 mapped counties | Binomial logistic DLNM, fitted for three pregnancy windows | Three monthly means, newest first |
| Madhya Pradesh under-five mortality | 10 divisions; no state block | Conditional-logistic case-crossover DLNM | Four daily values, lag 0–3 |

Each scorer returns an odds ratio, 95% confidence interval, training-support
metadata, and immutable model provenance. Training occurred in upstream
restricted-data modeling projects; CHART packages and scores approved fitted
parameters rather than retraining the models.

The ten division models cover Bhopal, Chambal, Gwalior, Indore, Jabalpur,
Narmadapuram, Rewa, Sagar, Shahdol, and Ujjain. The modeller also supplied one
separate MP-wide LBW object. Its fitted rows span Madhya Pradesh, but the
received files provide no reproducible three-window state fitting workflow.
CHART therefore validates only the supplied window 1
for state-level LBW prediction. The under-five mortality release has no state
block, so the state may expose the model in its catalog but cannot run a state
mortality prediction.

### What is directly supported by the source files

| Coverage | What the modeller supplied | What CHART may claim |
|---|---|---|
| MP LBW state | One fitted MP-wide `glm` object with 33,792 fitted observations, its DLNM basis, prediction object, and `MMt = 27` | A separate MP-wide fitted block for source window 1 only |
| MP LBW divisions | Ten division-specific fitted blocks for each of three pregnancy windows | Direct division-level scoring for all three windows |
| Kenya LBW | Five climate-zone-specific fitted blocks for each of three pregnancy windows | County climate input may use its explicitly mapped fitted zone block |
| Kajiado | No county-specific model; manifest maps Kajiado to `South-eastern` | Kajiado boundary supplies climate input and the South-eastern fitted block supplies the response curve |

Both fitting scripts contain later meta-analysis/BLUP exploration. The compact
CHART artifacts use the direct fitted `Model_*` blocks, not those BLUP curves.
Kenya has no supplied Kenya-wide model and no Kajiado-specific fit.

!!! note "MP state coverage follows the supplied fit"
    The compact artifact physically contains only the supplied MP-wide window
    1 block. The retired CHART refitting path cannot create state windows 2 or
    3. Those windows can be added only through a new modeller-supplied release.

## What the estimate means

The scorer compares one three-month temperature profile with a flat reference
temperature profile:

- an odds ratio of `1` means equal modeled odds at the two profiles;
- an odds ratio above `1` means higher conditional modeled odds;
- an odds ratio below `1` means lower conditional modeled odds.

The returned 95% confidence interval represents uncertainty in the fitted
association. It does not include uncertainty from climate inputs, spatial
aggregation, future climate scenarios, survey measurement, or unmeasured
confounding.

!!! warning "Association, not individual risk"
    The output is not an individual probability, diagnosis, causal estimate,
    or clinical decision rule. It is an association conditional on the fitted
    observational model and its covariates.

## Training data and fitting

The saved bundles originate from the Madhya Pradesh LBW modeling project:

```text
DHS India birth and household records for 2015–16 and 2019–21
  → survey clusters assigned to Madhya Pradesh divisions
  → monthly ERA5 maximum-temperature lags joined to births
  → non-linear temperature and lag basis
  → binomial logistic regression
  → versioned fitted blocks and respondent-free inference artifacts
```

The available packaging code uses a B-spline temperature basis, a two-month
lag, and covariates for birth season, relative humidity, maternal age,
residence, education, child sex, BMI, parity, and wealth.

The complete canonical fitting workflow and restricted DHS/NFHS records are
not stored in this repository. The division fitting script and supplied
MP-wide fit belong to the upstream modeling project. CHART stores only code
that packages or scores approved fitted artifacts.

See the [health input contract](health-input-contract.md) for the proposed
source fields, data rights, and unresolved extraction decisions.

## Model artifacts

The release-aware runtime uses respondent-free compact R artifacts:

| Artifact | Contents |
|---|---|
| `IN_MP_LBW_tmax_v1.0.1-compact.rds` | One supplied MP-wide window 1 block plus 10 supplied divisions × 3 pregnancy windows (31 blocks total) |
| `KE_climate_zone_LBW_tmax_v0.2.1-review.rds` | Five fitted climate zones × 3 pregnancy windows |

The `.rds` files are deliberately ignored by Git. Local developers must obtain
approved copies through the project model-artifact process. Deployed
environments retrieve versioned objects from private S3 locations.

`Dlnlm_Objs.rds` is the received source of the single MP-wide fitted object. It
is not evidence of three independently supplied state pregnancy-window blocks.

## Model inputs

The scorer requires exactly three Celsius values:

```json
{
  "area": "Gwalior",
  "trimester": 1,
  "tmax_lag": [37.2, 36.8, 35.4]
}
```

The temperature order is:

| Position | Meaning |
|---|---|
| `lag 0` | Latest month, closest to birth |
| `lag 1` | One month earlier |
| `lag 2` | Two months earlier |

The current API's `trimester` field is a model-window identifier:

| Value | Pregnancy window |
|---:|---|
| `1` | Latest window, corresponding to T3 |
| `2` | Middle window, corresponding to T2 |
| `3` | Earliest window, corresponding to T1 |

!!! important "Counterintuitive numbering"
    The API value `1` means the latest pregnancy window, not the first
    trimester. Preserve this mapping when connecting prepared climate inputs.

## Reference temperatures

- The supplied MP-wide block uses a fixed `27 °C` reference.
- Each division and pregnancy window defaults to the 25th percentile of its
  training temperatures.
- A caller may supply a different `ref`, but the response should be interpreted
  relative to that explicit comparison profile.

The response includes `modelled_temperature_range_c` and
`on_training_support`. The range comes directly from the selected fitted
block's DLNM `Boundary.knots`, so it can differ by location and pregnancy
window. Treat any result outside that block-specific range as extrapolation.

The interactive response exposes two distinct derived percentages:

- `relative_odds_change_percent` is signed by default: `OR 0.62` becomes
  `-38%`, `OR 1.25` becomes `+25%`. When the release's
  `output_contract.attributable_fraction` is set to `"positive_excess_only"`
  the *below-reference* tail (query temperature < reference) is collapsed
  to `0.0` — the paper's editorial scope for that fit does not interpret
  cooler-than-reference temperatures. Above-reference readings are always
  reported at full precision, even when the block's fitted spline returns
  `OR < 1` at that temperature (a small-sample instability in a division
  fit, for example); hiding it would misrepresent what the runtime
  actually computed.
- `attributable_fraction_percent` is always positive-excess-only and
  therefore returns zero when the odds ratio is one or lower. It must not
  be labelled as the signed change in odds.

The dashboard mirrors the server-side policy: when the response reports
`OR < 1` with `relative_odds_change_percent == 0`, the slider stat sentence
renders "At or below the reference — no heat-attributable excess" rather
than a signed number, and the slider itself clamps its lower bound to the
release's reference temperature so the below-reference region is
unreachable from the UI.

## Run the inference service locally

Requirements:

- R 4.0 or newer;
- the `dlnm`, `plumber`, and `jsonlite` R packages;
- an approved compact `.rds` artifact in `pipelines/models/lbw/model/` whose
  filename and SHA-256 match a `pipelines/models/lbw/model-release.*.json`
  manifest.

Launch the release-aware runtime:

```bash
cd pipelines/models/lbw
MODEL_CONTROL_TOKEN=local-only-secret PORT=8000 bash run_registry_api.sh
```

The service listens on `http://127.0.0.1:8000` and starts empty. The backend
loads models on demand via the protected `/models/load` endpoint. Full endpoint
list and a curl example live in
[`pipelines/models/lbw/README.md`](https://github.com/CHART-Scope/CHART/blob/main/pipelines/models/lbw/README.md).

## How CHART uses the model

The direct R service is the deterministic scorer. CHART connects it to prepared
climate data through the Python API and Dagster:

```mermaid
flowchart LR
    ERA5["ERA5 monthly temperature"] --> DB["Postgres climate facts"]
    DB --> Request["Authenticated prediction request"]
    Request --> Dagster["Dagster background run"]
    Dagster --> Scorer["R DLNM scorer"]
    Scorer --> Result["Stored odds ratio and interval"]
```

The Python API accepts the planning request, enforces role and geography
access, and stores durable request status. Dagster obtains the required climate
window and calls the R service. See [Climate API](climate-api.md) for the
authenticated request and polling contract.

### How a place picks a model block

Every scored request — batch (`/climate/predict`) or interactive slider
(`/climate/what-if`) — starts from a single `geography_id` sent by the caller.
The complete boundary, manifest, artifact, and scoring relationship is:

```mermaid
flowchart LR
    User["User selects a place<br/>State, county, division, district"] --> Place["Administrative place<br/>geography_id + place_code"]

    Place --> Boundary["Administrative boundary<br/>GeoJSON polygon"]
    Boundary --> Climate["Climate data extraction<br/>for that boundary"]
    Climate --> Input["Model input<br/>monthly or daily temperatures"]

    Place --> Mapping["Manifest coverage mapping<br/>place_code → model_area_name"]
    Manifest["Model-release manifest"] --> Mapping

    Artifact["Versioned model artifact<br/>basis + coefficients + covariance<br/>reference + support"] --> Block["Fitted model block<br/>keyed by model_area_name"]
    Mapping --> Block

    Input --> Scorer["DLNM scorer"]
    Block --> Scorer
    Scorer --> Result["Odds ratio + 95% CI<br/>support and provenance"]
```

- **`geographies`** — one row per selectable place in the UI (state, division,
  district, …). The id is what the frontend sends.
- **`admin_unit`** — one row per analytic area. Linked to `geographies` via
  `admin_unit.app_geography_id`. Carries the stable `code` (`place_code` in the
  release manifest).
- **`model_area_mapping`** — binds each `admin_unit` to a `model_area_key`, a
  `model_file`, and `validated_pregnancy_windows` for one `model_release`.
- **`active_model_assignment`** — pins one active mapping per
  `(admin_unit, module, outcome)` at any time.

The R scorer routes on `area` name (`model_area_key`): the string is compared
against the block-name suffix inside the `.rds` bundle (e.g.
`cbTemp_Bhopal_Sem01` for area `Bhopal`, window `1`). A state-level place
resolves to `Madhya Pradesh` and picks the separately supplied MP-wide block;
a division
resolves to that division's name and picks the division bundle. Two callers
sending different `geography_id`s therefore hit **genuinely different DLNM
blocks with different boundary knots, reference temperatures, and
`n_training`** — this is how the "Viewing for" dropdown on the dashboard
switches models. See [`pipelines/models/inference/adapters/compact_score.R`](
https://github.com/CHART-Scope/CHART/blob/main/pipelines/models/inference/adapters/compact_score.R)
for the block-selection logic and
[Model artifacts](#model-artifacts) for the current bundle filenames.

### Supported geographies and model artifacts

The manifest-driven routing above is country-agnostic; the differences
between releases are entirely encoded in the manifest's `areas` mapping and
the fitted blocks in each `.rds`. The table below lists the geographies
currently shipped in this codebase, the artifact each release scores
against, and the upstream source the modeller supplied.

| Geography | Outcome | Fitted-block granularity | Compact artifact | Manifest | Source |
|---|---|---|---|---|---|
| 🇮🇳 India — Madhya Pradesh | Low birth weight | 1 MP-wide block (window 1) + 10 division blocks (windows 1–3) | `IN_MP_LBW_tmax_v1.0.1-compact.rds` | [`model-release.mp.compact.review.json`](https://github.com/CHART-Scope/CHART/blob/dev/pipelines/models/lbw/model-release.mp.compact.review.json) | Zhu Z, Zhang T, Benmarhnia T, et al. *Lancet Planet Health* 2024 |
| 🇮🇳 India — Madhya Pradesh | Under-five mortality | 10 division blocks (no state block) | `IN_MP_U5M_tmean_v0.1.0-compact.rds` | [`model-release.mp.review.json`](https://github.com/CHART-Scope/CHART/blob/dev/pipelines/models/under_five_mortality/model-release.mp.review.json) | Case-crossover DLNM using NFHS-7 birth histories |
| 🇰🇪 Kenya — 47 counties | Low birth weight | 5 climate-zone blocks (each window 1–3), county→zone map | `KE_climate_zone_LBW_tmax_v0.2.1-review.rds` | [`model-release.kenya.review.json`](https://github.com/CHART-Scope/CHART/blob/dev/pipelines/models/lbw/model-release.kenya.review.json) | Climate-zone recomposition of Kenya DHS |

Two learnings the release shape encodes:

- **The polygon and the fitted block need not match one-to-one.** A place's
  boundary controls climate extraction (its geometry), while the fitted
  block is chosen by whatever the manifest's `areas[*].model_area_name`
  says — often the same string ("Madhya Pradesh"), sometimes a
  zone-of-many-counties ("South-eastern"), sometimes a pregnancy-window
  suffix ("Bhopal_Sem01"). If a place resolves to no `model_area_name`
  (Turkana, Kajiado sub-counties), the county is still selectable for
  climate context but returns no prediction.
- **Every release has its own reference anchor.** Some fits are anchored
  at a fixed editorial reference (MP LBW: 27°C, matching the source
  paper); others let each block use its own modeller-computed MMT (the
  Kenya climate-zone bundle and U5M). The `presentation.editorial_reference_temperature_c`
  field on the manifest is what tells the runtime to override the bundled
  MMT — omit it to keep whatever the `.rds` was fit against.

!!! note "Frontend contract"
    Any UI panel that calls a per-place model endpoint must send the district
    id when the user has picked one, not just the parent state id. On the
    dashboard the two hooks that do this are `useAutoPrediction` and
    `useWhatIfScore`, both computing `effectiveGeographyId = adminUnit ??
    geographyId`. Panels that also read per-place history
    (`listPredictionRequests`) apply the same rule.

### Adding another model in the same release shape

When a new outcome or country is added, the routing above stays intact as long
as the manifest supplies one `admin_unit`-scoped row per model block. The
release process is described in
[Add a geography and model](add-geography-and-model.md); the block-name
convention the R scorer expects lives beside the model in
[`pipelines/models/`](https://github.com/CHART-Scope/CHART/tree/main/pipelines/models).

## Releasing a new model

Every release should provide:

1. a new immutable versioned artifact filename;
2. the training data and eligibility description;
3. the outcome definition and covariate specification;
4. the exposure variable, units, aggregation, lag order, and pregnancy-window
   mapping;
5. geography mappings for every model block;
6. training-support ranges and reference temperatures;
7. validation results against known profiles;
8. a cryptographic checksum for each artifact;
9. limitations, intended use, and approval record.

The current demo reports the model filename and semantic version, but it does
not verify an artifact checksum in the R response. Runtime checksum enforcement
should be completed before treating model activation as production-grade.

## Limitations and open work

- The current review implementation covers Madhya Pradesh and Kenya; only
  manifest-validated place/window combinations may run.
- Results depend on observational DHS/NFHS data and modeled ERA5 exposure.
- Bounding-box or administrative aggregation can differ from individual
  exposure.
- Exact upstream training filters and survey-design handling still need a
  canonical, reviewable release record.
- Climate uncertainty and model uncertainty are not combined.
- The direct port `8000` service has no end-user authentication; CHART users
  should access prediction through the authenticated Python API.
- New geographies require approved health data, exposure joins, fitted model
  blocks, validation, and a versioned artifact release.

For implementation-level details, see the
[LBW demo README](https://github.com/CHART-Scope/CHART/blob/dev/pipelines/models/lbw/README.md).
