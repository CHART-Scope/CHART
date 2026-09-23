# Isolated EC2 development dependencies

This is a private development environment on the same EC2 machine as the
public sandbox. It is a separate Compose project (`chart-dev`), network
(`chart-dev_default`) and database volume (`chart-dev_postgres-data`). It has
its own Postgres/PostGIS, Keycloak users and realm, and Mailpit. It never joins
the sandbox's network or uses its databases, model volumes, proxy or domains.
The development service names intentionally omit global `container_name` values.

The Next app, Python API, Dagster and R model runtime still run locally, so
local code changes work normally. Dagster's existing local SQLite history and
the local model/climate files stay on the Mac. CHART core does not require the
separate Payload chart repository.

## Daily development

After the one-time setup, `.local/remote-dev.enabled` selects remote services
for this checkout. Normal `make run`, `make migrate` and `make climate-api`
connect to the development dependencies rather than recreating local Docker
containers. `CHART_SERVICES=local` is an explicit opt-out; stop the tunnel
before returning to local services.

Remote-mode startup and Keycloak restart preserve the migrated accounts.
They do not automatically re-import seed users. `make identity-sync` remains
an explicit administrative operation that can overwrite seeded users.

```bash
make remote-connect
make remote-check
make run
```

`make remote-services` starts the isolated remote containers if they have
been stopped. `make remote-disconnect` closes only this checkout's SSH tunnel;
it leaves EC2 services running. `make remote-status` checks the tunnel.
The default SSH alias is `chart`; override with `CHART_SSH_HOST=another-alias`.
Keep SSH host-key verification enabled.

The database identifies itself as `chart-dev`; `make remote-check` verifies
that identity before the normal Makefile migration path can proceed.

| Service       | Local address through SSH | EC2 loopback port |
| ------------- | ------------------------- | ----------------- |
| Postgres      | `127.0.0.1:5434`          | `15434`           |
| Keycloak      | `http://127.0.0.1:8080`   | `18080`           |
| Mailpit SMTP  | `127.0.0.1:1025`          | `11025`           |
| Mailpit inbox | `http://127.0.0.1:8025`   | `18025`           |

All published ports bind to `127.0.0.1` on EC2 and on the Mac. No new EC2
security-group rules or proxy routes are needed. Keycloak advertises the
local tunnel URL so browser login and API token issuer checks agree.
Credentials retain the local development defaults; they are not sandbox
credentials. This environment must remain private behind SSH.

## First-time provisioning and migration

Use a new `~/chart-dev` directory on the SSH host. Copy only
`infra/remote-dev/docker-compose.yml`, `infra/postgres`, and `infra/keycloak`
there, retaining their repository-relative paths. Do not copy `.env.prod`.
Build and start the database alone before importing existing development data:

```bash
ssh chart 'cd ~/chart-dev/infra/remote-dev && docker compose -p chart-dev up -d --build postgres'
```

Back up both local databases (`chart` and `chart_keycloak`) using PostgreSQL 16
`pg_dump --format=custom`, plus `pg_dumpall --globals-only`. Store backups with
private permissions under `.local/remote-dev/backups/`; this directory is
gitignored. Verify archive listings and checksums before transferring them.
Restore into the new development databases only, with Keycloak stopped.
Preserve `chart_keycloak` ownership when restoring its database. Never run a
restore against the `chart` Compose project in `~/chart-deploy`.

Compare every application's and Keycloak's table row counts before starting
the remote Keycloak service. Then start all development dependencies:

```bash
make remote-services
```

Stop the three local CHART containers to free their ports, then connect and
validate the tunnel. After verifying database content, Keycloak issuer/login,
and Mailpit, enable the checkout's remote mode:

```bash
mkdir -p .local
touch .local/remote-dev.enabled
make remote-check
make migrate
```

Remove only the local `chart-postgres`, `chart-keycloak`, and `chart-mailpit`
containers after the restored services pass validation. Retain the original
`infra_chart-postgres-data` volume and verified dumps for rollback. Do not use
`docker system prune`, `docker volume prune`, or `compose down --volumes`.
Unrelated local Docker projects are outside this migration.

## Rollback

Disconnect the tunnel, remove `.local/remote-dev.enabled`, and start the
original local Compose services using `make services CHART_SERVICES=local`.
Their preserved volume contains the pre-migration data. Changes made on EC2
after cutover are not automatically copied back; take new remote database
backups before moving active development back to the Mac.

## Checks

```bash
.venv/bin/python -m unittest discover -s infra/remote-dev -p 'test_*.py'
bash -n infra/remote-dev/tunnel.sh
docker compose -f infra/remote-dev/docker-compose.yml -p chart-dev config --quiet
```

### Monthly dashboard checks after restoring data

A successful database restore does not imply climate results have been generated.
The monthly dashboard prepares missing months through the local Dagster worker.
Dagster dispatch keys include the request reservation token so retained run history
cannot suppress a new request whose numeric ID was reused after a database restore.

All model-enabled areas need extraction polygons and bounding boxes. If the India
areas were registered without geometry, load the verified generated model-area file
with the existing geography importer against the development database:

```sh
DATABASE_URL=postgresql+psycopg://chart:chart@127.0.0.1:5434/chart \
  .venv/bin/python -m chart.geographies.cli \
  data/boundaries/generated/mp-model-areas.geojson
```

Generate the file using `pipelines/boundaries/README.md` if it is missing. Do not
substitute another area's observations or use fixture data for this recovery.
