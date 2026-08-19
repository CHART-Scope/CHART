# CHART model runtime

The R HTTP service that CHART calls to score every deployed model, plus the
per-family manifest + artifact directories it serves from. Adapter dispatch on
the manifest's `runtime.adapter` field lets one runtime host many model
families.

## Layout

```
pipelines/models/
├── Dockerfile                        # runtime container image
├── run_registry_api.sh               # container entrypoint (launches api_registry.R)
├── inference/
│   ├── api_registry.R                # Plumber HTTP API: /health, /models, /models/load, /predict
│   ├── serialization.R               # 15-decimal JSON serializer
│   ├── adapters/
│   │   ├── compact_score.R           # DLNM scoring — the compact_r_registry adapter
│   │   └── score_core.R              # numerical helpers used by compact_score.R
│   └── tests/
│       ├── test_serialization.R      # baked into Dockerfile test stage
│       └── test_compact_score.R
├── lbw/                              # model family: low-birth-weight
│   ├── model-release.*.json          # manifests
│   └── model/*.rds                   # compact artifacts (gitignored)
└── under_five_mortality/             # model family: MP under-five mortality
    ├── model-release.*.json
    └── ...
```

## Adapter dispatch

The `runtime.adapter` field in each manifest names the scoring code that
handles its artifacts. The current runtime bundles one adapter,
`compact_r_registry`, which serves every family using compact DLNM artifacts
(LBW and under-five mortality today). Adding a new model family with a
different math means writing a new adapter under `inference/adapters/`,
sourcing it from `api_registry.R`, and having the manifest declare its name.

The Python side (`chart.model_registry.runtime.prepare_model_release`) mirrors
this dispatch — a manifest whose adapter is unknown fails with
`MODEL_RUNTIME_ADAPTER_UNSUPPORTED` rather than silently loading an unsupported
artifact.

## Currently deployed manifests

| Family     | Manifest                                            | Model file                                   | Release id                         |
| ---------- | --------------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| LBW        | `lbw/model-release.mp.compact.review.json`          | `IN_MP_LBW_tmax_v1.0.1-compact.rds`          | `lbw-mp-1.0.1-compact-review`      |
| LBW        | `lbw/model-release.kenya.review.json`               | `KE_climate_zone_LBW_tmax_v0.2.1-review.rds` | `lbw-ke-climate-zone-0.2.1-review` |
| Under-five | `under_five_mortality/model-release.mp.review.json` | (see manifest)                               | `under5-mortality-mp-0.1.0-review` |

Review-only manifests are gated by `CHART_ENABLE_REVIEW_MODELS=true`. Add a new
release by dropping a `model-release.<slug>.json` under
`pipelines/models/<family>/`; the backend picks it up via
`chart.setup.model_configs.deployed_models()`.

## Running the service

Prefer `make run` from the repo root — it starts R, Python API, Dagster, and
the web app together with the shared `MODEL_CONTROL_TOKEN` pre-wired. See
[Installation setup — Model registry control token](../../docs/installation-setup.md#model-registry-control-token)
for why the token exists and how to override it.

Standalone R (for debugging one process in isolation):

```bash
MODEL_CONTROL_TOKEN=local-only-secret \
MODEL_CACHE_DIR="$(pwd)/pipelines/models" \
PORT=8000 \
bash pipelines/models/run_registry_api.sh
```

Environment variables:

| Variable              | Default    | Purpose                                                                                                        |
| --------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `HOST`                | `0.0.0.0`  | Bind address.                                                                                                  |
| `PORT`                | `8000`     | Plumber port.                                                                                                  |
| `MODEL_CACHE_DIR`     | `/models`  | Directory scanned recursively for RDS files.                                                                   |
| `MODEL_CONTROL_TOKEN` | _required_ | Shared secret matched against `X-CHART-Model-Control-Token` on `/models/load`. Must equal the backend's value. |

Docker build:

```bash
docker build --target runtime -t chart-lbw pipelines/models
docker build --target test -t chart-lbw-test pipelines/models   # runs the R self-tests
```

## Loading models

The CHART backend does this automatically at setup completion (via
`chart.model_registry.runtime.prepare_model_release`). To reproduce by hand:

```bash
curl -X POST http://127.0.0.1:8000/models/load \
  -H "X-CHART-Model-Control-Token: $MODEL_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "release_id": "lbw-ke-climate-zone-0.2.1-review",
    "model_version": "0.2.1-review",
    "model_file": "KE_climate_zone_LBW_tmax_v0.2.1-review.rds",
    "model_sha256": "ffc9ed89723f...",
    "local_path": "/models/lbw/model/KE_climate_zone_LBW_tmax_v0.2.1-review.rds"
  }'
```

`/predict` requires the release identity in the request body and refuses any
mismatch — enforced on the Python side too in
`chart.inference.service.score_lbw`.

## Constraints on compact artifacts

Compact `.rds` files must contain only basis settings, coefficients, covariance
matrices, reference temperatures, supported ranges, and aggregate training
counts. They must **not** contain respondent rows, household identifiers,
coordinates, fitted model frames, or any other restricted microdata.

## Related documentation

- [Model releases](../../docs/model-updates.md) — manifest schema, versioning,
  and how the backend consumes releases.
- [Add a geography and model](../../docs/add-geography-and-model.md) —
  end-to-end steps for adding a new place or model family.
- [Modeling](../../docs/modeling.md) — inputs, outputs, and interpretation.
