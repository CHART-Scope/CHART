# AWS deployment

GitHub Actions builds CHART once and publishes commit-tagged images to GitHub
Container Registry. The EC2 host does not clone the repository or build images.
It receives this small deployment bundle, pulls the requested image tag, and
runs Docker Compose.

## Release flow

1. Pull requests run tests and validate all three deploy images.
2. A push to `dev` runs the same validation, builds the Python, web, and LBW
   images, and pushes both the commit SHA and `dev` tags to GHCR.
3. CI copies `infra/aws` and `infra/keycloak` to `~/chart-deploy` on EC2.
4. EC2 logs in to GHCR and runs `docker compose pull` followed by
   `docker compose up -d --remove-orphans` using the host's single runtime file,
   `~/chart-deploy/aws/.env.prod`.

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
routes `/chart-core`, `/climate`, and `/identity` to their services. Everything
else goes to the web app. Dagster remains bound to `127.0.0.1:3000`.

## One-time EC2 setup

Install Docker with the Compose plugin and allow the deployment SSH user to run
Docker. The workflow creates its deployment and backup directories under that
user's home directory.

Set `MODEL_BUCKET_PUBLIC=0` and grant the EC2 instance role read access when the
model S3 bucket is private. The default `MODEL_BUCKET_PUBLIC=1` uses anonymous
read access. Ports 80 and 443 must be open, and the public domain must point to
the instance. Caddy uses port 80 for certificate issuance and HTTP-to-HTTPS
redirects.

Required GitHub `dev` environment secrets are:

- `AWS_APP_HOST`
- `AWS_APP_USER`
- `AWS_APP_SSH_KEY`

Create the single local runtime file:

```bash
vim infra/aws/.env.prod
```

Paste these seven settings with their real values:

```dotenv
PUBLIC_ORIGIN=https://your-domain
POSTGRES_PASSWORD=your-existing-postgres-password
KEYCLOAK_ADMIN_PASSWORD=your-keycloak-admin-password
CHART_BOOTSTRAP_TOKEN=your-bootstrap-token
MODEL_CONTROL_TOKEN=your-model-control-token
CDSAPI_URL=https://cds.climate.copernicus.eu/api
CDSAPI_KEY=your-copernicus-key
```

Save it, then copy that same file to the sandbox:

```bash
chmod 600 infra/aws/.env.prod
ssh <user>@<host> 'mkdir -p ~/chart-deploy/aws && chmod 700 ~/chart-deploy ~/chart-deploy/aws'
scp infra/aws/.env.prod <user>@<host>:chart-deploy/aws/.env.prod
ssh <user>@<host> 'chmod 600 ~/chart-deploy/aws/.env.prod'
```

The local file is gitignored, and the deployment does not read any other
environment file. Keep `POSTGRES_PASSWORD` URL-safe and preserve its existing
value because changing it does not update an existing Postgres data volume.

## Operations

Inspect the deployment on EC2:

```bash
docker ps --filter label=com.docker.compose.project=chart
docker logs --tail 100 chart-core
```

The deployment workflow automatically includes full Compose status and recent
logs when a release fails.

Open the private Dagster UI through an SSH tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 <user>@<host>
```

Database backups are written to `~/chart-deploy/aws/backups` before migrations
and retained for 14 days. Application data, model files, climate outputs,
Dagster state, and Caddy certificates use named Docker volumes.
