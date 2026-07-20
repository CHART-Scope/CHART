# AWS Deploy

`App Deploy` runs the core app on one EC2 host from the `dev` branch.

The workflow:

1. validates API and web;
2. SSHes into the host using GitHub secrets;
3. resets `/opt/chart` to `origin/dev`;
4. runs `infra/aws/deploy-app.sh`.

The script runs Docker containers for Postgres, Keycloak, the Fastify API, web,
LBW inference, the Python climate API, the Dagster webserver and daemon, and nginx.
Only nginx is public:

- `/`: Next web app
- `/chart-api/auth/*`: Python Keycloak token validation and user context
- `/chart-api/*`: remaining Fastify API routes
- `/climate/*`: Python climate and prediction API
- `/climate-api/health`: Python API health check
- `/lbw/*`: LBW inference API
- `/identity`: Keycloak

Dagster binds to `127.0.0.1:3000` on the EC2 host and is not exposed by nginx.

## GitHub Secrets

Required:

- `AWS_APP_HOST`: EC2 SSH host.
- `AWS_APP_USER`: EC2 SSH user.
- `AWS_APP_SSH_KEY`: private SSH key. Its public key must be in
  `/home/<AWS_APP_USER>/.ssh/authorized_keys`.
- `CDSAPI_URL`: Copernicus CDS API URL.
- `CDSAPI_KEY`: Copernicus CDS API key.
- `LBW_MODEL_DIVISION_S3_URI`: private S3 URI for the division model bundle.
- `LBW_MODEL_STATE_S3_URI`: private S3 URI for the state model bundle.

Optional:

- `AWS_APP_PUBLIC_HOST`: browser-facing hostname. Use this for a subdomain.

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

The repository verifier performs the same authenticated request, polls Dagster,
and checks the persisted database row. The token must include one of the prediction
roles and a geography group that contains `/india/madhya-pradesh`:

```bash
export CHART_ACCESS_TOKEN='<keycloak-access-token>'
python backend/scripts/verify_on_demand_prediction.py \
  --api-url http://<host> \
  --dagster-ui-url http://127.0.0.1:3000
```

**Reset a user to re-experience onboarding:**

```bash
docker exec -it chart-postgres psql -U chart -d chart \
  -c "DELETE FROM users WHERE email = 'chart-admin@example.org';"
```

**Full wipe and redeploy:**

```bash
docker rm -f chart-proxy chart-web chart-api chart-climate-api chart-dagster-webserver chart-dagster-daemon chart-lbw chart-keycloak chart-keycloak-postgres chart-postgres
docker volume rm chart-postgres-data chart-keycloak-postgres-data chart-dagster-storage chart-climate-data
PUBLIC_HOST=<host> bash /opt/chart/infra/aws/deploy-app.sh
```

**Find the Keycloak admin password:**

```bash
grep KEYCLOAK_ADMIN_PASSWORD /opt/chart-env/chart.env
```

## Workflows

- `API`: API checks only.
- `Web UI`: Next/web checks only.
- `Storybook Pages`: Storybook build and Pages publish.
- `App Deploy`: API + web checks, then EC2 deploy.
