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

Do not remove the existing `CDSAPI_*`, `LBW_MODEL_*`, `INFERENCE_LLM_*`, Google
identity-provider, or bootstrap-token secrets while simplifying the public
origin. They configure independent services. In particular, the LBW scorer
starts only when both model S3 URIs are present.

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
