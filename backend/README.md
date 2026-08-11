# CHART Python backend

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

Follow [Add a geography and model](../docs/add-geography-and-model.md). The
model handoff file is
[`pipelines/models/lbw/model-release.example.json`](../pipelines/models/lbw/model-release.example.json).

### Test the Kenya onboarding path locally

Build the ignored Kenya compact artifact as documented in
[`KENYA_MODEL_INTEGRATION.md`](../pipelines/models/lbw/KENYA_MODEL_INTEGRATION.md),
then run the normal stack:

```bash
make run
```

After an installation reset, choose **Kenya → County → Kajiado**. Local setup
registers the review manifest, verifies the cached artifact, warms it in the
internal Plumber registry runtime, and activates the Kajiado → South-eastern
mapping. The planning web reads Kajiado from the Python backend; it does not
read the RDS or call the model-control endpoint directly.

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

## Tests

```bash
python -m pytest backend/tests -q
python -m pytest orchestration/tests -q
```
