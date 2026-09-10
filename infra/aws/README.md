# AWS deployment

GitHub Actions builds CHART once and publishes commit-tagged images to GitHub
Container Registry. The EC2 host does not clone the repository or build images.
It receives this small deployment bundle, pulls the requested image tag, and
runs Docker Compose.

## Release flow

1. Pull requests run tests and validate all three deploy images.
2. A push to `dev` runs the same validation, builds the Python, web, and LBW
   images, and pushes both the commit SHA and `dev` tags to GHCR.
3. CI copies `infra/aws` and `infra/keycloak` to `/opt/chart-deploy` on EC2 and
   passes one encoded runtime-environment secret to the deployment command.
4. EC2 logs in to GHCR and runs `docker compose pull` followed by
   `docker compose up -d --wait --remove-orphans`. Compose reads the settings
   from a temporary file in `/dev/shm`, which is deleted when the command ends.

On the first release after this migration, CI removes the old manually managed
containers after the new images have been pulled. Named volumes are retained.
Later releases are managed entirely by Compose.

The SHA tag is used for the deployment, so a release always identifies the
exact images it runs. The moving `dev` tag is available for inspection only.

## Services

Compose runs the Next web app, FastAPI, Dagster webserver and daemon,
Postgres/PostGIS, Keycloak, the LBW scorer, and Caddy. It also runs short-lived
containers for the database backup, database migrations, geography/model
bootstrap, model download, Dagster migration, and Keycloak configuration.
Those jobs are dependencies of the long-running services, so the single
`compose up` command stops if preparation fails.

Caddy is the public entrypoint. It obtains and renews HTTPS certificates when
`PUBLIC_ORIGIN` is an HTTPS domain, stores them in a persistent volume, and
routes `/chart-api`, `/climate`, and `/identity` to their services. Everything
else goes to the web app. Dagster remains bound to `127.0.0.1:3000`.

## One-time EC2 setup

Install Docker with the Compose plugin and create directories writable by the
deployment SSH user:

```bash
sudo install -d -o "$USER" -g "$USER" /opt/chart-deploy
sudo install -d -m 700 -o "$USER" -g "$USER" /opt/chart-backups
```

Set `MODEL_BUCKET_PUBLIC=0` and grant the EC2 instance role read access when the
model S3 bucket is private. The default `MODEL_BUCKET_PUBLIC=1` uses anonymous
read access. Ports 80 and 443 must be open, and the public domain must point to
the instance. Caddy uses port 80 for certificate issuance and HTTP-to-HTTPS
redirects.

Required GitHub `dev` environment secrets are:

- `AWS_APP_HOST`
- `AWS_APP_USER`
- `AWS_APP_SSH_KEY`
- `CHART_RUNTIME_ENV`

Store every Compose setting in the single multiline `CHART_RUNTIME_ENV` secret:

```dotenv
PUBLIC_ORIGIN=https://chart.example.org
POSTGRES_PASSWORD=replace-me
KEYCLOAK_ADMIN_PASSWORD=replace-me
CHART_BOOTSTRAP_TOKEN=replace-me
MODEL_CONTROL_TOKEN=replace-me
AWS_REGION=eu-west-2
MODEL_BUCKET=chart-predictive-models
MODEL_BUCKET_PUBLIC=1
CHART_ENABLE_REVIEW_MODELS=true
CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES=true
```

Optional settings such as `CDSAPI_KEY`, the explanation service, and the Google
identity provider can be added to this same secret. Adding a setting does not
require a workflow change. Keep `POSTGRES_PASSWORD` URL-safe because it is
embedded in the application database URL.

Before the first release, copy the existing values from
`/opt/chart-env/chart.env` and `/opt/chart-env/prediction-worker.env` into
`CHART_RUNTIME_ENV`. Keep the existing `POSTGRES_PASSWORD`: changing it does not
update the password inside an existing Postgres data volume. After a successful
release, the old environment files can be removed from EC2.

## Operations

Inspect the deployment on EC2:

```bash
docker ps --filter label=com.docker.compose.project=chart
docker logs --tail 100 chart-api
```

The deployment workflow automatically includes full Compose status and recent
logs when a release fails.

Open the private Dagster UI through an SSH tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 <user>@<host>
```

Database backups are written to `/opt/chart-backups` before migrations and
retained for 14 days. Application data, model files, climate outputs, Dagster
state, and Caddy certificates use named Docker volumes.
