# AWS sandbox deployment

The `App Deploy` workflow provisions one EC2 host with the web app, Python API,
Dagster, Postgres, Keycloak, nginx, and the optional LBW scorer. HTTP and HTTPS
use the same deployment path; the canonical browser origin determines the
Keycloak SSL policy, callbacks, cookies, CORS origin, and proxy headers.

The detailed operational runbook is
[`infra/aws/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/README.md).

## GitHub configuration

The automated `dev` deployment reads these GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `AWS_APP_PUBLIC_ORIGIN` | Preferred complete browser origin, including `http://` or `https://`. |
| `AWS_APP_PUBLIC_HOST` | Host or IP fallback when a complete origin is not configured. |
| `CHART_PUBLIC_SCHEME` | Scheme fallback; defaults to `https`. |
| `CHART_ALLOW_INSECURE_HTTP` | Required safety gate for an HTTP deployment. |
| `CHART_TLS_TERMINATED_UPSTREAM` | Set to `1` when a trusted load balancer terminates HTTPS. |
| `CHART_TLS_CERT_FILE` | Certificate path when nginx terminates HTTPS on the host. |
| `CHART_TLS_KEY_FILE` | Private-key path when nginx terminates HTTPS on the host. |

Prefer `AWS_APP_PUBLIC_ORIGIN`; it removes ambiguity by carrying the scheme,
host, and optional port together. When it is set, the deploy derives the scheme
and host from it rather than the fallback settings.

Do not remove the existing `CDSAPI_*`, `INFERENCE_LLM_*`, Google
identity-provider, or bootstrap-token secrets while simplifying the public
origin. They configure independent services. Model S3 URIs are not
deployment secrets — each model's `model-release.json` manifest carries its
own `base_uri` (currently `s3://chart-predictive-models` for LBW) and the
deploy derives the concrete URIs from it.

## Files on the host

The deploy script generates these protected files under `/opt/chart-env`:

- `chart.env` for the Python API and shared application settings;
- `web.env` for the web application;
- `dagster.env` for Dagster storage;
- `prediction-worker.env` for climate, model, and optional explanation inputs;
- `nginx.conf` for the public proxy;
- `backups/` for pre-migration database backups.

These are deployment outputs, not independent configuration sources. Do not
delete, combine, or manually edit them; the next deployment recreates them.
Inspect only the keys needed for diagnosis because the files contain secrets:

```bash
sudo grep -E '^(CHART_WEB_ORIGIN|KEYCLOAK_BROWSER_URL|KEYCLOAK_ISSUER_URL)=' \
  /opt/chart-env/chart.env /opt/chart-env/web.env
```

## HTTP domain or IP

For an isolated HTTP sandbox, configure:

```text
AWS_APP_PUBLIC_ORIGIN=http://sandbox.example.org
CHART_ALLOW_INSECURE_HTTP=1
```

An IPv4 address or explicit port can be used instead, provided the browser uses
that same canonical origin. The deploy sets the Keycloak realm to
`sslRequired=none`, aligns its client redirects and web origins, and configures
nginx to redirect alternate hosts to the canonical origin.

Keycloak-managed username and password accounts work in this mode. Google
Workspace login is automatically disabled for a non-local HTTP origin because
Google OAuth requires HTTPS for that callback. Localhost HTTP remains eligible
for local development.

!!! warning

    Use cleartext HTTP only for an isolated sandbox. Passwords, session cookies,
    and access tokens otherwise cross the network without transport encryption.

## HTTPS

Set `AWS_APP_PUBLIC_ORIGIN=https://<domain>` and use one TLS setup:

- **nginx terminates TLS.** Stage the certificate and private key on the host,
  set `CHART_TLS_CERT_FILE` and `CHART_TLS_KEY_FILE` to their paths, and open
  port 443.
- **A trusted load balancer terminates TLS.** Forward to host port 80 and set
  `CHART_TLS_TERMINATED_UPSTREAM=1`.

The deploy sets the Keycloak realm to `sslRequired=external`. Google Workspace
login can be enabled when its client credentials and hosted domain are also
configured. Switching between HTTP and HTTPS requires changing the canonical
origin and deploying again; do not update Keycloak manually.

## Run without GitHub Actions

The deployment script can run directly from a clone on a Linux/Docker host.
Pass the same settings as ordinary process environment variables:

```bash
sudo env \
  APP_DIR="$PWD" \
  PUBLIC_ORIGIN="http://sandbox.example.org" \
  ALLOW_INSECURE_HTTP=1 \
  bash infra/aws/deploy-app.sh
```

For HTTPS, use an `https://` origin and provide either
`TLS_TERMINATED_UPSTREAM=1` or readable `TLS_CERT_FILE` and `TLS_KEY_FILE`
paths. Optional climate, model, Google, and explanation settings use the same
names documented in the operational runbook. GitHub is only one way to pass
those inputs; it is not required by the script.

## Model artifacts on S3

Every model release ships as two things:

1. **A manifest** in the repo at `pipelines/models/<family>/model-release.*.json`.
   The manifest carries the release id, version, expected SHA256, and the
   S3 `base_uri` for that release's artifacts.
2. **One or more `.rds` files** stored on S3 under the manifest's `base_uri`.
   The runtime never fetches them — the app expects them on disk in
   `MODEL_CACHE_DIR`, so the deploy pipeline pulls them from S3 into the
   shared `chart-lbw-model` volume before the R container starts.

### Bucket layout

Files live at `{base_uri}/{filename}`, keyed by country → outcome →
version so a bucket listing is self-describing:

```text
s3://chart-predictive-models/
├── india/
│   └── mp/
│       ├── lbw/
│       │   └── 1.0.1-compact-review/
│       │       └── IN_MP_LBW_tmax_v1.0.1-compact.rds
│       └── under-five-mortality/
│           └── 0.1.0-review/
│               └── IN_MP_under5_mortality_tmax_v0.1.0-review.rds
├── kenya/
│   └── lbw/
│       └── 0.2.1-review/
│           └── KE_climate_zone_LBW_tmax_v0.2.1-review.rds
└── archive/                   # retired artifacts kept for provenance
```

Bucket versioning is enabled so an accidental overwrite is recoverable.
Retired artifacts (pre-compact-registry rewrites) live under `archive/`
and are excluded from the deploy sync.

### Deploy-time sync

`infra/aws/deploy-app.sh` walks every `pipelines/models/**/model-release.*.json`
manifest at deploy time, extracts each `(base_uri, filename)` pair, and
runs a scoped `aws s3 sync` into the shared `chart-lbw-model` Docker
volume before the R container starts. Only files the manifests actually
reference are pulled; unrelated bucket objects (WIP releases,
`archive/`) are ignored. The sync is idempotent — `aws s3 sync` skips
files whose local copy already matches — so redeploys are cheap.

The sync runs inside a throwaway `public.ecr.aws/aws-cli/aws-cli`
container that mounts the volume at `/models`. This avoids host-side
`chmod`/`sudo` on the Docker volume directory (owned by root) and
inherits credentials from the EC2 instance profile via IMDS. The
instance role therefore needs read access to the model bucket.

If the sync is skipped or the file names diverge, the app fails cleanly
at startup with `MODEL_RELEASE_FILE_MISSING` (name not found under
`MODEL_CACHE_DIR`) or `MODEL_RELEASE_CHECKSUM_MISMATCH` (name matches
but SHA256 differs from the manifest).

### Environment variables

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `MODEL_BUCKET` | `deploy-app.sh` shell env | `chart-predictive-models` | Bucket the deploy sync pulls from. |
| `MODEL_CACHE_DIR` | Python API + R container | `/models` | Where the app expects the artifacts on disk (deploy binds the host volume here). |
| `MODEL_CONTROL_TOKEN` | Python API + R container | generated | Shared secret gating `/models/load` on the R runtime. |

The Python side's `warm_model_artifact` searches `MODEL_CACHE_DIR`
recursively (`rglob(filename)`) — the on-disk directory layout can
mirror the S3 tree (recommended, matches the deploy sync) or be flat;
what matters is that the filename in the manifest exists somewhere
under the cache root.

### Adding a new release

1. Upload the new `.rds` to `s3://<MODEL_BUCKET>/<base_uri path>/<filename>`.
2. Commit a manifest under `pipelines/models/<family>/` pointing at that
   `base_uri` + `filename` with the file's SHA256.
3. Merge to `dev` — the next deploy syncs the file and activates the
   release automatically. No infra edit required.

## Deployment and verification

A pull request validates the deployment candidate but does not change the EC2
host. Merging or pushing to `dev` runs the deployment. The final checks verify:

- web build identity and public reachability;
- Python API readiness and unauthenticated auth behavior;
- the Keycloak realm endpoint; and
- a complete OIDC authorization request for the configured callback.

## Related

- [`infra/aws/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/README.md)
  — complete secret inventory, host requirements, and operational checks.
- [`infra/keycloak/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/keycloak/README.md)
  — identity-provider configuration and callback rules.
- [`infra/aws/deploy-app.sh`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/deploy-app.sh)
  — the unchanged deployment implementation described by this page.
