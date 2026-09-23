# CHART Python core

This is the single CHART application API and analytical engine.

It owns authentication checks, setup, users, workspaces, geographies, climate
data, model registration, prediction requests, and public solution reads.
SQLAlchemy defines the CHART tables and Alembic is the only migration tool.

```bash
export DATABASE_URL=postgresql+psycopg://chart:chart@localhost:5434/chart
make migrate
make climate-api
```

Swagger is at `http://127.0.0.1:3210/docs`.

The prediction path is deliberately ordered:

1. reserve the durable request with an expiring ownership token;
2. save or fetch the three monthly climate values through a single-flight lease;
3. validate their place, exact source cutoff, dates, source, quality, and freshness;
4. save the exact input set and its hash;
5. select the active model assignment for that place and verify its artifact hash;
6. call the deterministic scorer and validate its echoed inputs, interval,
   model version, and SHA-256;
7. commit only if the worker still owns the request;
8. optionally request a plain-language explanation.

An explanation failure cannot change or block the numerical result.

Use `GET /live` for liveness and `GET /ready` for database, migration, and
model-assignment readiness. A deployment is not ready until the single Alembic
head (currently `015_reconcile_legacy_application_schema`) is applied.

Recover an existing administrator only from an operator shell. The password is
read from the environment so it is not placed in shell history:

```bash
CHART_ADMIN_RECOVERY_PASSWORD='<new-password>' chart-admin-recover \
  --username chart-admin \
  --email chart-admin@example.org \
  --confirm chart-admin
```

## Add a place or model

Follow [Add a geography and model](../docs/add-geography-and-model.md). A
worked example lives at
[`pipelines/models/lbw/model-release.kenya.review.json`](../pipelines/models/lbw/model-release.kenya.review.json).

### Test the Kenya onboarding path locally

Build the ignored Kenya compact artifact as documented in
[`pipelines/models/lbw/README.md`](../pipelines/models/lbw/README.md),
then run the normal stack:

```bash
make run
```

After an installation reset, choose **Kenya → County → Kajiado** or **Kenya →
Sub-county** and one of Kajiado Central, East, North, South, or West. Local setup
loads the tracked administrative boundaries, registers the review manifest,
verifies the cached artifact, warms it in the internal Plumber registry runtime,
and activates each place's explicit South-eastern mapping. Climate ingestion
uses the selected administrative polygon; inference uses the shared
climate-zone response curve. The planning web does not read the RDS or call the
model-control endpoint directly.

This path is enabled locally with `CHART_ENABLE_REVIEW_MODELS=true`. Do not set
that flag in production; the Kenya release still requires modeller approval.

## Invitation emails

Use the reusable invitation template when inviting a planner:

```python
from chart.email import (
    InvitationEmail,
    OutboundEmail,
    build_email_service,
    build_invitation_email,
)

email_service = build_email_service()
message = build_invitation_email(
    InvitationEmail(
        recipient_email="planner@example.org",
        recipient_name="Grace Lemayian",
        inviter_name="Kenya Ministry of Health",
        geography_name="Kajiado County",
        role_name="County planning lead",
        start_date="1 January 2026",
        end_date="31 December 2026",
        activation_url="https://chart.example.org/",
    )
)
result = email_service.send_best_effort(message)
```

`send_best_effort` returns `sent`, `failed`, or `skipped`. It logs classified
transport failures without logging the recipient or message body. Use `send`
instead when the caller must handle a delivery failure.

## Monthly dashboard reads

`GET /risk/{geography_id}/monthly` returns ERA5 monthly maximum temperature
and precomputed LBW health impacts keyed by `YYYY-MM`. Pass the selected
place's `AppGeography.id` directly, including for a division. Authentication,
reader roles and geography scope are enforced. Optional `?month=2026-09`
selects one calendar month; invalid month keys return 422.

Each `months` entry contains:

- `temperature`: `tmax_monthly_max_c`, `unit` (`degC`), source, run ID and
  data label, or `null` if no ERA5 MAX observation is available.
- `health_impacts`: persisted LBW results for that exact `valid_month`, with
  scenario, horizon, run ID, attributable fraction and attributable number.
  Fraction units follow the existing fixed-point contract: `130` milli is
  `0.130`, displayed as `13.0%`. An empty array means no computed result;
  zero means a computed zero. A null attributable number remains unknown.

The month list is the sorted union of available observations and impacts.
Scenarios/horizons are never collapsed into one estimate, and gaps are not
interpolated. Temperature revisions prefer the newest `generated_at`, then
run ID. The ERA5 loader already persists both MAX and mean, so no migration
or data rewrite is needed. This endpoint never falls back to mean temperature.

MAX uses the existing ERA5 aggregation: hourly temperature to daily maximum
per cell, cosine-latitude weighted spatial mean over the selected area, then
the maximum of those daily area values within each calendar month. It is
neither the mean of daily maxima nor the maximum over the whole history.

The LBW dashboard uses this endpoint for month navigation. Stored health
impacts retain the existing OR-based AF approximation described in
`chart/health_impact/derivation.py`; they are not recalculated from the displayed
observation. Prediction input windows still select `tmax_monthly_mean_c` in
`chart/climate/input_windows.py`, and the canonical model input contract still
requires that variable. Aligning those model inputs with the September 10
meeting's MAX requirement is separate from this read/display change and
requires updating the source adapters and validating the model contract.

## Tests

```bash
python -m pytest core/tests -q
python -m pytest orchestration/tests -q
```

The monthly response also includes `prediction` for the signed-in user's completed,
observed LBW request ending in that month. This reads the current model registry's
durable result even when no legacy `erf_parameters` / `health_impact` row exists.
It does not expose another user's saved requests. Forecasts, projections, sample
inputs, and other pregnancy windows are excluded from this observed estimate.
`input_statistic` identifies the existing model contract, and `fraction_method`
identifies the positive-excess odds-ratio approximation; missing case counts remain
unknown.

The dashboard offers the last twelve complete calendar months and any already
stored months. For eligible model areas and planning roles, selecting a missing
month submits the existing durable prediction request, polls it, and rereads the
monthly results. Preparation continues in Dagster after navigation. Failure offers
a retry; the temperature scenario tool remains available while there are no
monthly results. This preparation uses the model's existing three-month mean-Tmax
input contract while the temperature display reads the separate ERA5 monthly peak.
