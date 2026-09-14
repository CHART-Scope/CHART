# AWS sandbox deployment

The `App Deploy` workflow validates CHART, publishes commit-tagged images to
GitHub Container Registry, and deploys those images to one EC2 host with Docker
Compose. EC2 receives the small `infra/aws` and `infra/keycloak` deployment
bundle; it does not clone or build the repository.

The operational setup is documented in
[`infra/aws/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/README.md).

## GitHub configuration

Create a GitHub environment named `dev` with these connection secrets:

| Secret | Purpose |
| --- | --- |
| `AWS_APP_HOST` | EC2 hostname or IP used by SSH. |
| `AWS_APP_USER` | EC2 deployment user. |
| `AWS_APP_SSH_KEY` | Private SSH key for that user. |

Application settings are written once in the gitignored
`infra/aws/.env.prod`, then copied unchanged to
`~/chart-deploy/aws/.env.prod` on EC2. The exact seven-line configuration and
`vim` setup are documented once in `infra/aws/README.md`.

## Host setup

Install Docker with the Compose plugin and allow the deployment SSH user to run
Docker. The workflow creates `~/chart-deploy` and its backup directory without
requiring access to `/opt`.

Allow inbound ports 80 and 443 and point the public domain at the instance.
Caddy obtains and renews certificates for an HTTPS `PUBLIC_ORIGIN`. An HTTP
origin is suitable only for an isolated sandbox; Google sign-in requires HTTPS
for a non-local callback.

Create `~/chart-deploy/aws/.env.prod` before the first deployment. Preserve the
existing `POSTGRES_PASSWORD` when retaining an existing database volume.

## Model artifacts on S3

Each model release consists of a checked-in manifest under
`pipelines/models/<family>/` and its `.rds` files under the manifest's S3
`base_uri`. Before starting the scorer, Compose syncs the configured bucket into
the shared `chart-lbw-model` volume and excludes `archive/*`.

Set `MODEL_BUCKET_PUBLIC=1` for the current anonymous list/read bucket policy.
For a private bucket, set it to `0` and grant the EC2 instance role
`s3:ListBucket` and `s3:GetObject` on the bucket. No AWS access keys are stored
in GitHub.

The sync is idempotent. A release fails during startup if a manifest artifact is
missing or its SHA-256 does not match.

To add a model release:

1. Upload the `.rds` file beneath the manifest's S3 `base_uri`.
2. Commit the manifest under `pipelines/models/<family>/`.
3. Merge to `dev`; the next deployment syncs and activates it.

## Deployment and verification

Pull requests run validation and build all deploy images without changing EC2.
A push to `dev`, or a manually dispatched workflow, publishes and deploys the
exact commit SHA. The workflow then checks that the public web build reports
that SHA and that the API readiness endpoint succeeds.

On failure, the workflow reports Compose status and recent logs. On the host,
the current containers can be inspected with:

```bash
docker ps --filter label=com.docker.compose.project=chart
docker logs --tail 100 chart-api
```

Database backups are created in `~/chart-deploy/aws/backups` before migrations
and kept for 14 days. Postgres, models, climate outputs, Dagster state, and
Caddy certificates use named Docker volumes.

## Related

- [`infra/aws/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/README.md)
- [`infra/aws/docker-compose.yml`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/docker-compose.yml)
- [`infra/keycloak/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/keycloak/README.md)
