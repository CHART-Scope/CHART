# AWS deploy

`App Deploy` validates the requested commit and runs
`infra/aws/deploy-app.sh` on one EC2 host.

## What runs

- the canonical `web` Next app;
- one Python/FastAPI application API;
- Dagster webserver and daemon;
- Postgres/PostGIS;
- Keycloak;
- nginx;
- the LBW R scorer when both model files are configured.

Fastify and Drizzle are not installed or deployed. Alembic is the only CHART
database migration path.

The deploy creates a timestamped PostgreSQL backup, runs the checked Alembic
migration script, loads the versioned Madhya Pradesh boundaries and place
mappings, verifies both expected model SHA-256 values, registers scoped model
assignments, then migrates Dagster storage. Backups are stored under
`/opt/chart-env/backups` for 14 days.

## Public paths

- `/`: Next web
- `/chart-api/*`: Python application API
- `/climate/*`: the same Python API, kept as a planning shortcut
- `/chart-api/live`: process liveness
- `/chart-api/ready`: database, migration, and model readiness
- `/identity/*`: Keycloak

Dagster and the LBW scorer bind only to localhost on the host.

## GitHub secrets

Required:

- `AWS_APP_HOST`
- `AWS_APP_USER`
- `AWS_APP_SSH_KEY`

Optional:

- `AWS_APP_PUBLIC_HOST`
- `AWS_APP_PUBLIC_ORIGIN`
- `CHART_BOOTSTRAP_TOKEN` (generated and persisted when omitted)
- `KEYCLOAK_GOOGLE_CLIENT_ID`
- `KEYCLOAK_GOOGLE_CLIENT_SECRET`
- `KEYCLOAK_GOOGLE_HOSTED_DOMAIN`
- `CHART_TLS_TERMINATED_UPSTREAM`
- `CHART_TLS_CERT_FILE`
- `CHART_TLS_KEY_FILE`
- `CDSAPI_URL`
- `CDSAPI_KEY`
- `LBW_MODEL_DIVISION_S3_URI`
- `LBW_MODEL_STATE_S3_URI`
- `INFERENCE_LLM_ENABLED`
- `INFERENCE_LLM_BASE_URL`
- `INFERENCE_LLM_MODEL`
- `INFERENCE_LLM_API_KEY`

Both LBW model URIs must be configured together. Copernicus and optional
explanation credentials are stored in `/opt/chart-env/prediction-worker.env`
with mode `600` and passed only to Dagster workers. Users never enter them.
The release ID, version, and expected artifact hashes come from the checked-in
model-release manifest rather than independent mutable deployment variables.

Without those optional integrations, the main app still starts and existing
climate data remains readable. A prediction reports a clear unavailable error
until its climate source and scorer are configured.

## HTTP vs HTTPS

`AWS_APP_PUBLIC_ORIGIN` (or an auto-detected fallback) chooses the scheme.
Plain HTTP is only accepted when `ALLOW_INSECURE_HTTP=1` is also set — reserved
for isolated development sandboxes. When the deploy runs on HTTP the Keycloak
realm's `sslRequired` is set to `none` so the login flow stops rejecting the
browser; on HTTPS it stays at `external`, matching `chart-realm.json`. The
setting is re-applied on every deploy, so a sandbox that later gains a TLS
certificate switches back to strict enforcement without any manual kcadm work.

## EC2 requirements

- Docker running;
- port 443 open and a TLS certificate/key, or a trusted upstream load balancer
  that terminates TLS;
- deploy SSH key installed;
- an instance role that can read both LBW model objects;
- 4 vCPU and 16 GiB RAM when all services share the host.

## Checks

```bash
docker ps -a --filter "name=chart-"
docker logs chart-api --tail 50
docker logs chart-web --tail 50
docker logs chart-dagster-daemon --tail 50
docker logs chart-dagster-webserver --tail 50
docker logs chart-proxy --tail 50
```

Open the private Dagster UI through a tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 <user>@<host>
```

Then open `http://127.0.0.1:3000`.

Test one deployed prediction with an authorised token:

```bash
curl -s https://<host>/chart-api/climate/predict \
  -H 'authorization: Bearer <keycloak-access-token>' \
  -H 'content-type: application/json' \
  -d '{"geography_id":"geo-in-madhya-pradesh","planning_date":"2026-10-01","outcome":"lbw","pregnancy_window":1}'
```

Poll the returned `status_url` through `/chart-api` until it completes. Record
the request ID, Dagster run ID, climate-source hash, input hash, model version,
and dashboard evidence for release sign-off.

Find the Keycloak admin password with:

```bash
grep KEYCLOAK_ADMIN_PASSWORD /opt/chart-env/chart.env
```

Recover an existing CHART administrator without deleting application data:

```bash
docker exec \
  -e CHART_ADMIN_RECOVERY_PASSWORD='<new-password>' \
  chart-api chart-admin-recover \
  --username chart-admin \
  --email chart-admin@example.org \
  --confirm chart-admin
```
