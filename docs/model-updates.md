# Where model updates happen

Two audiences use this page:

- **CHART core developers** adding a second model, releasing a new
  version of an existing one, or wiring an `erf_parameters` curve for
  a geography.
- **External adopters** downloading CHART and running it with their own
  climate + health model.

The paths and commands are the same for both; the difference is who
runs which step and how the artefacts are stored.

---

## 1. The model-release contract

Every model release is described by one JSON file matching
[`pipelines/models/lbw/model-release.example.json`](../pipelines/models/lbw/model-release.example.json).
The file is the single source of truth for:

- `id`, `version` — release identifiers, immutable once shipped.
- `module` — always `prediction` for now.
- `outcome` — the health outcome (`lbw`, `heat_mortality`, …).
- `climate_hazard` — the climate driver (`extreme_heat`, `flooding`, …).
- `temperature_input` — a human-readable description of the tmax lag
  the R model expects; keeps the modeler + platform aligned.
- `months_required` — number of climate months per prediction.
- `model_files[]` — filename + `sha256` for each `.rds` bundle.
- `areas[]` — every place the release covers, with `place_code`,
  `country_code`, `level` (`state`, `division`, `county`, …),
  `model_file`, `model_area_name`, and per-area validated pregnancy
  windows.

**Contract rule:** an admin_unit is only ever bound to at most one
active `model_release_id` per (module, outcome). Publishing a new
release for a place replaces the binding atomically; the old release
row stays for audit.

## 2. Where files live

```
pipelines/
├─ models/
│  └─ lbw/                              # one directory per outcome
│     ├─ model-release.example.json     # the canonical release manifest
│     ├─ inference/                     # R sources (api.R, predict.R, …)
│     ├─ tests/                         # pytest + R model_release tests
│     ├─ Dockerfile                     # LBW inference image
│     ├─ DEPLOY.md                      # image + registration ops notes
│     └─ README.md                      # what the model is + how it runs
├─ era5_heat/                           # climate ingestion (not a model)
├─ seasonal_c3s/                        # climate ingestion
├─ isimip_projection/                   # climate ingestion
└─ boundaries/                          # GIS spine
```

A new model release for the same outcome goes into
`pipelines/models/lbw/` (bump `version`, ship a new manifest, add new
`.rds` files with fresh sha256s). A new *outcome* gets its own peer
directory (`pipelines/models/heat_mortality/`, `pipelines/models/flooding/`).

## 3. CHART core developer workflow

You need write access to the CHART repo and to the internal Postgres
that stores `active_model_assignment`.

### Add a geography

If the release covers a place CHART does not know about yet, seed the
AppGeography first:

1. Add the display names to `backend/chart/geographies/catalog.py`
   (`MP_LBW_MODEL_AREAS` is the template).
2. Update `backend/chart/geographies/load.py` `_seed_mp_places` (or
   add a peer for your country) so `AppGeography` rows land at the
   right hierarchy, e.g. `/india/madhya-pradesh/divisions/bhopal`.
3. Add the `AdminUnit` rows through the boundary loader
   (`pipelines/boundaries/`) so the model's `place_code` binds cleanly
   to a spatial admin_unit.

### Register the model release

```bash
python -m chart.model_registry.cli \
  pipelines/models/lbw/model-release.example.json \
  --model-dir /path/to/rds/files \
  --activate
```

The CLI validates the manifest against `ModelReleaseSpec`, uploads the
`.rds` files (or references them by S3 URI, depending on `base_uri`),
inserts a `ModelRelease` row and one `ModelAreaMapping` per area, then
creates or replaces the matching `ActiveModelAssignment` rows.

### Publish the fitted curve

The R model file evaluates the ERF at runtime; CHART separately stores
the curve's shape for the projection pipeline. Push it via the
service-to-service endpoint:

```bash
curl -X POST http://api.chart.local/internal/erf-parameters \
  -H "authorization: Bearer $CHART_INTERNAL_API_TOKEN" \
  -H "content-type: application/json" \
  -d @path/to/erf-parameters.json
```

The endpoint is idempotent on `(geography, outcome, git_ref)` — see
[`backend/chart/erf_registry/schemas.py`](../backend/chart/erf_registry/schemas.py)
for the exact payload shape.

Once both are in place:

- `AppGeography.supportsPrediction` flips true for every place covered.
- The dashboard "Viewing for" dropdown shows the state + all supported
  divisions/counties.
- `POST /climate/predict` stops returning `MODEL_NOT_AVAILABLE_FOR_PLACE`.
- Every finished prediction populates `health_impact` through the
  materialisation bridge in `chart.climate.requests`.

### Ship a new version of the same model

1. Modeler produces new `.rds` files and updated coefficients.
2. Bump `version` and update `sha256`s in a fresh manifest.
3. Re-run the CLI with `--activate`. Old release stays queryable.
4. Push the new curve to `/internal/erf-parameters` with a new
   `git_ref`.

---

## 4. External adopter workflow

An adopter is anyone running CHART outside the Scope-hosted deployment
— a government team, a university, a partner NGO. The steps are the
same as above, but the *source* of the model artefact differs.

### Download and run CHART

```bash
git clone https://github.com/CHART-Scope/CHART.git
cd CHART
make services   # postgres + minio + keycloak via docker compose
make migrate    # applies backend/alembic migrations up to head
make run        # web + backend + dagster
```

The dashboard is available at `http://localhost:3000/dashboard/<geography-id>`,
but it will render the "not configured" empty state until at least one
model is registered.

### Register your own model release

You have three options depending on where your model comes from:

**a) Adopt the reference LBW model as-is** (fastest for evaluation).
Point your `--model-dir` at the `.rds` files distributed with CHART's
LBW release and run the registration CLI. Everything works out of the
box for Madhya Pradesh.

**b) Fit your own model against your own DHS-equivalent data.**
Follow the modeler's guide at `docs/modeling.md` to reproduce the fit,
export `.rds` bundles per admin_area, and author your own
`model-release.json` mirroring the reference shape. The manifest
`sha256` fields must match your `.rds` files bit-for-bit.

**c) Ship a completely different outcome or hazard.**
Create a new directory under `pipelines/models/` and provide your own
inference container (`Dockerfile` + `api.R`). The platform contract
is: given three monthly climate values for one admin_area, return an
`odds_ratio` + `ci95_low` + `ci95_high`. The rest of the pipeline —
climate ingestion, materialisation, dashboard — is model-agnostic.

### Where your model file physically lives

- **Local / evaluation** — mount it into the LBW inference container
  via the `model-dir` volume in `infra/docker-compose.yml`.
- **AWS reference deployment** — upload to the model bucket referenced
  by `model_release.base_uri`; `infra/aws/deploy-app.sh` copies it
  from your workstation into the bucket during release.
- **Air-gapped self-hosting** — bake the `.rds` file into the LBW
  inference image at build time; set `base_uri` to a local path.

### Where the fitted curve physically lives

`ErfParameters.spline_coefficients` is a JSON blob stored inside
Postgres. It is small (a few hundred bytes at most). Publishing it
means POSTing to `/internal/erf-parameters` — no external storage
required.

---

## 5. Where the docs live

If you change the model contract or the workflow, update:

- **This page** (`docs/model-updates.md`) — the "what changed" and
  "where does it happen" story for both audiences.
- **[`docs/modeling.md`](modeling.md)** — the science and validation
  workflow for the modeler themselves.
- **[`docs/add-geography-and-model.md`](add-geography-and-model.md)**
  — the operational runbook for adding a specific geography + model
  pairing.
- **[`pipelines/models/lbw/README.md`](../pipelines/models/lbw/README.md)**
  — the inside-view README that lives next to the code.

CI's docs check (`mkdocs build --strict` in `.github/workflows/docs.yml`)
fails on broken links between these files, so the four pages stay in
sync.
