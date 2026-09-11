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
   `docker compose up -d --wait --remove-orphans` using the host's
   `~/chart-deploy/aws/.env.prod` file.

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

Create the production environment locally from the tracked example:

```bash
cp infra/aws/env.prod.example infra/aws/.env.prod
```

The repository's `.gitignore` excludes `.env.prod`. Fill in the existing
passwords and optional integrations, then copy it to EC2 once:

```bash
ssh <user>@<host> 'mkdir -p ~/chart-deploy/aws'
scp infra/aws/.env.prod <user>@<host>:chart-deploy/aws/.env.prod
ssh <user>@<host> 'chmod 600 ~/chart-deploy/aws/.env.prod'
```

Keep `POSTGRES_PASSWORD` URL-safe and preserve its existing value because it is
embedded in application URLs and changing it does not update an existing
Postgres data volume. When `.env.prod` is absent, the first release automatically
migrates the existing `/opt/chart-env/chart.env` and
`/opt/chart-env/prediction-worker.env` values. Add any Google identity-provider
settings manually because the old deployment did not store those on EC2.

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

Database backups are written to `~/chart-deploy/aws/backups` before migrations
and retained for 14 days. Application data, model files, climate outputs,
Dagster state, and Caddy certificates use named Docker volumes.
