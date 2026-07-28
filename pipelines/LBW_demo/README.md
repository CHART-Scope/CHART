# LBW × maximum-temperature association — direct inference demo

This is a small browser/API wrapper around already fitted R Distributed Lag
Non-linear Models (DLNM). It estimates a **conditional odds ratio for low birth
weight (LBW)** for a three-month temperature profile relative to a reference
temperature profile. The three values can come from a seasonal forecast,
observations, or a climate projection.

It does **not** download weather, run a forecast, create climate scenarios, or
calculate an individual baby's probability of LBW. The user supplies the three
exposure values and the saved R models perform the association calculation.

## What is included

```text
model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds
    Division bundle: 10 Madhya Pradesh divisions × 3 pregnancy windows

model/MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds
    State bundle: one original whole-Madhya-Pradesh model plus two locally
    reconstructed blocks that are not approved for state-stage reporting

model/Dlnlm_Objs_source.rds
    Source artifact for the original whole-MP Sem01 fit (packaging input only)

inference/score.R
    Shared scoring helpers for state and division model blocks

inference/package_state_model.R
    One-off packaging script that builds the state bundle from the original share

inference/predict.R
    Direct CLI inference from three manually supplied exposure values

inference/api.R
    Plumber API and same-origin static UI server

web/index.html
    Direct-input browser UI; it has no synthetic climate scenarios

client/query.py
    Small Python client using only the standard library
```

Both inference bundles are required at runtime. They are ignored by Git and are
downloaded from private S3 for EC2 deployment.

## Model provenance chain

The demo serves two geography levels from the same original LBW modelling
project:

| Demo bundle | Geography | Original source | Fitting script / note |
|---|---|---|---|
| `MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds` | 10 MP divisions | `Dlnm_Mod_obj_by_sem_and_Division_MP_2026_07_05.rds` | `Create_LBW_Madhya_Pradesh_final_Analysis_by_Division_2026_07_05.R` |
| `MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds` | Whole Madhya Pradesh | `Dlnlm_Objs.rds` for Sem01; division bundle for Sem02/Sem03 packaging | Interactive whole-state analysis in the original project `.Rhistory` |

### Upstream data and methods

```text
DHS India birth + household records (MP, 2015-16 and 2019-21)
  → GPS clusters assigned to MP administrative divisions
  → ERA5-based monthly maximum temperature lags linked to each birth
  → DLNM cross-basis (B-spline temperature, lag structure)
  → logistic regression with covariates (season, RH, age, residence, education, sex, BMI, parity, wealth)

Division path:
  fit separately within each of 10 divisions × 3 pregnancy windows
  reference default = division-specific 25th percentile of training temperatures

State path:
  one original pooled MP fit is approved for current CHART use
  two reconstructed blocks remain disabled pending original model-team exports
  and written pregnancy-window mapping
  reference default = fixed 27 C (original whole-state analysis)
```

### The 10 division areas

Bhopal, Chambal, Gwalior, Indore, Jabalpur, Narmadapuram, Rewa, Sagar,
Shahdol, Ujjain.

The UI also exposes **Madhya Pradesh** as a state-wide option using the pooled
state bundle.

### Rebuilding the state bundle locally

If you have the original shared modelling outputs, place the source file and run:

```bash
cp /path/to/shared/Outputs/Report_data/Dlnlm_Objs.rds model/Dlnlm_Objs_source.rds
Rscript inference/package_state_model.R
```

This writes `model/MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds`.

## How a prediction works

```mermaid
flowchart TD
    A[Browser UI, Python client, or curl] --> B[POST /predict]
    B --> C{Validate request}
    C -->|Invalid area, trimester, or 3 temperatures| D[Return HTTP 400 JSON error]
    C -->|Valid| E{State or division?}
    E -->|Madhya Pradesh| F[Select state pregnancy-window block]
    E -->|Division name| G[Select division pregnancy-window block]
    F --> H{Was ref supplied?}
    G --> H
    H -->|Yes| I[Use supplied reference temperature]
    H -->|No| J[Use model default reference]
    I --> K[Rebuild saved DLNM basis for supplied temperatures]
    J --> K
    K --> L[Rebuild basis for flat three-month reference profile]
    L --> M[Subtract basis profiles and apply fitted temperature coefficients]
    M --> N[Return odds ratio, 95% CI, and support warning]
```

Reference defaults:

- **State:** 27 C
- **Division:** training-data 25th percentile for that division and window

## Exposure definition

The API requires exactly three values in Celsius:

```json
"tmax_lag": [37.2, 36.8, 35.4]
```

They are calendar-month means of **daily maximum 2 m temperature**, ordered:

```text
lag 0: latest month / closest to birth
lag 1: one month earlier
lag 2: two months earlier
```

The `trimester` is a model-window identifier:

```text
1: latest / last pregnancy window (T3)
2: middle window (T2)
3: earliest / first window (T1)
```

## Run locally

Requires R 4.0+ and Python 3.6+.

From the repository root, the normal full-app command starts this service with
the web app, Python API, and Dagster:

```bash
make run
```

To run only the model service:

```bash
make lbw-run
```

Open [http://127.0.0.1:8000/ui/](http://127.0.0.1:8000/ui/). Choose either
**Madhya Pradesh** or a division, enter three temperatures, then estimate.

## Command line

State-wide:

```bash
Rscript inference/predict.R \
  --area "Madhya Pradesh" \
  --trimester 1 \
  --tmax "38,37,35"
```

Division-specific:

```bash
Rscript inference/predict.R \
  --area Gwalior \
  --trimester 1 \
  --tmax "38,37,35" \
  --ref 28
```

Smoke tests:

```bash
bash run_cli.sh
```

## API

List areas:

```bash
curl -s http://127.0.0.1:8000/areas
```

Predict state-wide:

```bash
curl -s -X POST http://127.0.0.1:8000/predict \
  -H 'Content-Type: application/json' \
  -d '{
    "area": "Madhya Pradesh",
    "trimester": 1,
    "tmax_lag": [38, 37, 35]
  }'
```

Predict for a division:

```bash
curl -s -X POST http://127.0.0.1:8000/predict \
  -H 'Content-Type: application/json' \
  -d '{
    "area": "Gwalior",
    "trimester": 1,
    "tmax_lag": [38, 37, 35],
    "ref": 28
  }'
```

Important endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | readiness check and loaded model filenames |
| `GET` | `/areas` | state area plus accepted division names |
| `GET` | `/divisions` | backward-compatible division list |
| `POST` | `/predict` | direct temperature-association estimate |
| `GET` | `/ui/` | browser UI |

`POST /predict` accepts `area` (preferred) or legacy `division`.

A successful prediction returns `area`, `geography_level`, `odds_ratio`,
`ci95_low`, `ci95_high`, the modelled temperature range, and
`on_training_support`.

## Interpretation and limitations

- The output is an odds ratio conditional on the fitted observational model;
  it is not an individual probability, diagnosis, or causal estimate.
- State and division estimates can differ materially for the same temperature
  profile because they use different fitted curves and reference temperatures.
- The displayed confidence interval represents model-estimation uncertainty.
  It does not include uncertainty from climate data, spatial aggregation,
  future scenarios, or unmeasured confounding.
- Do not interpret values outside the reported modelled temperature range as
  reliable. The app labels those as extrapolated.

## Connecting real climate inputs

Climate processing must run outside the request path. Do not invoke a download
or a Python subprocess from `/predict`.

```text
Scheduled data job
  → retrieve and validate source data
  → spatially aggregate to the selected state or division
  → calculate monthly mean daily maxima
  → write versioned area/month exposure values
  → UI/API reads the prepared three values
  → POST /predict
```

## Container deployment

For a local Docker test, provide both model S3 URIs and AWS credentials:

```bash
docker build -t lbw-temperature-demo .
docker run --rm -p 8000:8000 \
  -e LBW_MODEL_DIVISION_S3_URI=s3://YOUR_PRIVATE_BUCKET/lbw-models/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds \
  -e LBW_MODEL_STATE_S3_URI=s3://YOUR_PRIVATE_BUCKET/lbw-models/MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds \
  -v "$HOME/.aws:/root/.aws:ro" \
  lbw-temperature-demo
```

For the CHART EC2 deployment—including the required IAM policy, persistent S3
configuration, push trigger, and verification steps—see [DEPLOY.md](DEPLOY.md).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `LBW_MODEL_DIVISION` | local API / CLI | Path to division model `.rds` |
| `LBW_MODEL_STATE` | local API / CLI | Path to state model `.rds` |
| `LBW_MODEL_DIR` | Docker / EC2 | Directory where models are cached (default `/models`) |
| `LBW_MODEL_DIVISION_S3_URI` | Docker / EC2 | Private `s3://` URI for the division bundle |
| `LBW_MODEL_STATE_S3_URI` | Docker / EC2 | Private `s3://` URI for the state bundle |
| `LBW_MODEL_S3_URI` | EC2 deploy only | Deprecated alias for `LBW_MODEL_DIVISION_S3_URI` |
| `HOST` | API | Bind address (default `127.0.0.1`, Docker uses `0.0.0.0`) |
| `PORT` | API | Listen port (default `8000`) |
| `LBW_STATE_SOURCE` | packaging only | Path to `Dlnlm_Objs_source.rds` when running `package_state_model.R` |

Local defaults are set by `run_api.sh` and `run_cli.sh`. Docker and EC2 download
both S3 objects on startup, then export `LBW_MODEL_DIVISION` and
`LBW_MODEL_STATE` as local file paths for `api.R`.
