# AWS Deploy

`App Deploy` runs the core app on one EC2 host from the `dev` branch.

The workflow:

1. validates API and web;
2. SSHes into the host using GitHub secrets;
3. resets `/opt/chart` to `origin/dev`;
4. runs `infra/aws/deploy-app.sh`.

The script runs Docker containers for Postgres, Keycloak, the Fastify API, web,
the Python API, the Dagster webserver and daemon, and nginx. LBW inference is
started when both model URIs are configured.
Database migrations run in order on deploy:

1. Drizzle (`npm run db:migrate:api`) via the API image
2. API seed (`npm run db:seed:api`)
3. Alembic (`alembic upgrade head`) via the Python image
4. Dagster instance storage migrations

Only nginx is public:

- `/`: Next web app
- `/chart-api/auth/*`: Python Keycloak token validation and user context
- `/chart-api/*`: remaining Fastify API routes
- `/climate/*`: Python climate and prediction API
- `/climate-api/health`: Python API health check
- `/lbw/*`: LBW inference API, when configured
- `/identity`: Keycloak

Dagster binds to `127.0.0.1:3000` on the EC2 host and is not exposed by nginx.

## GitHub Secrets

Required:

- `AWS_APP_HOST`: EC2 SSH host.
- `AWS_APP_USER`: EC2 SSH user.
- `AWS_APP_SSH_KEY`: private SSH key. Its public key must be in
  `/home/<AWS_APP_USER>/.ssh/authorized_keys`.

Optional:

- `AWS_APP_PUBLIC_ORIGIN`: browser-facing origin, including the scheme. Set this to
  the canonical HTTPS domain, for example `https://chart.example.org`. This value is
  used for Keycloak's issuer, web callback, logout redirects, CORS, and browser links.
- `AWS_APP_PUBLIC_HOST`: legacy HTTP hostname fallback when
  `AWS_APP_PUBLIC_ORIGIN` is not set.
- `KEYCLOAK_GOOGLE_CLIENT_ID` and `KEYCLOAK_GOOGLE_CLIENT_SECRET`: Google OAuth
  credentials for Scope Impact Workspace SSO. Configure both or neither.
- `KEYCLOAK_GOOGLE_HOSTED_DOMAIN`: allowed Google Workspace domain. Defaults to
  `scopeimpact.fi`.
- `CDSAPI_URL`: defaults to `https://cds.climate.copernicus.eu/api`.
- `CDSAPI_KEY`: deployment credential used only by Dagster for live ERA5 downloads.
- `LBW_MODEL_DIVISION_S3_URI`: private S3 URI for the division model bundle.
- `LBW_MODEL_STATE_S3_URI`: private S3 URI for the state model bundle. Configure both
  LBW model URIs together.

The core app deploys without the optional prediction integrations. Existing climate
data remains readable. A missing-climate request reports
`CLIMATE_INGEST_NOT_CONFIGURED` when no CDS key is available, while LBW processing
reports `LBW_SERVICE_NOT_CONFIGURED` when its model service is disabled. CHART users
never provide these deployment credentials.

For Google SSO, register this authorized redirect URI in the Google OAuth client:

```txt
https://<chart-domain>/identity/realms/chart/broker/scope-google/endpoint
```

The Google provider verifies the Workspace hosted-domain claim. A successful SSO
login creates a Keycloak identity but does not grant a protected CHART role or
geography.

`CDSAPI_KEY` is written to `/opt/chart-env/prediction-worker.env` and passed only to
the Dagster webserver and daemon. It is not passed to Next, Fastify, or the Python API.

## EC2 prerequisites

- Docker installed and running.
- Port 80 open in the EC2 security group.
- The deploy SSH key's public key in `/home/<AWS_APP_USER>/.ssh/authorized_keys`.
- An EC2 instance role that can read both LBW model S3 objects.
- 4 vCPU and 16 GiB RAM when Postgres, Dagster, climate ingest, and the app share one host.

## Ops

**Check container status:**

```bash
docker ps -a --filter "name=chart-"
```

**Tail logs:**

```bash
docker logs chart-web --tail 50
docker logs chart-api --tail 50
docker logs chart-climate-api --tail 50
docker logs chart-dagster-daemon --tail 50
docker logs chart-dagster-webserver --tail 50
docker logs chart-proxy --tail 50
```

**Open the private Dagster UI:**

```bash
ssh -L 3000:127.0.0.1:3000 <user>@<host>
```

Then open `http://127.0.0.1:3000`. The prediction-request sensor is enabled by default;
the monthly ERA5 schedule remains stopped until an operator enables it.

**Verify the deployed prediction handoff manually:**

```bash
curl -s http://<host>/climate/predict \
  -H 'authorization: Bearer <keycloak-access-token>' \
  -H 'content-type: application/json' \
  -d '{"location_slug":"madhya-pradesh","timeframe_id":"exposure_3m","outcome":{"type":"lbw","trimester":1}}'
```

The response is either a cached `200` result or a `202` containing `request_id` and
`status_url`. Poll `http://<host><status_url>` with the same bearer token until it
completes. Deployment health checks never submit this request automatically.

**Reset a user to re-experience onboarding:**

```bash
docker exec -it chart-postgres psql -U chart -d chart \
  -c "DELETE FROM users WHERE email = 'chart-admin@example.org';"
```

**Full wipe and redeploy:**

```bash
docker rm -f chart-proxy chart-web chart-api chart-climate-api chart-dagster-webserver chart-dagster-daemon chart-lbw chart-keycloak chart-postgres
docker volume rm chart-postgres-data chart-dagster-storage chart-climate-data
PUBLIC_ORIGIN=https://<chart-domain> bash /opt/chart/infra/aws/deploy-app.sh
```

Keycloak uses the `chart_keycloak` logical database and dedicated database role on
`chart-postgres`. On the first consolidated deployment, the script transactionally
migrates an existing standalone Keycloak database before starting Keycloak. The
legacy `chart-keycloak-postgres-data` volume remains available for rollback and can
be removed manually after confirming sign-in and SSO configuration.

**Find the Keycloak admin password:**

```bash
grep KEYCLOAK_ADMIN_PASSWORD /opt/chart-env/chart.env
```

## Workflows

- `API`: API checks only.
- `Web UI`: Next/web checks only.
- `Storybook Pages`: Storybook build and Pages publish.
- `App Deploy`: API + web checks, then EC2 deploy.
