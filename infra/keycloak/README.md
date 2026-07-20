# Keycloak

Keycloak is the identity system. CHART is the policy system (geography, workspace, roles).

## Local start

```bash
make identity
make identity-sync
```

`make identity-sync` re-applies seed groups and users to an existing realm. Run it after changing `chart-realm.json` or after a volume reset.

Use `make identity-restart` after changing local theme files.

Local development uses the shared `chart-postgres` server with two isolated logical
databases: `chart` for the application and `chart_keycloak` for Keycloak. Keycloak
connects with its own `chart_keycloak` database role; it does not write to CHART's
application tables.

Admin console: `http://localhost:8080` — `admin` / `admin` — realm `chart`

## Upstream SSO

Keycloak is CHART's identity broker and token issuer. Configure Google Workspace or
Microsoft Entra as an identity provider in the `chart` realm; the web app and Python
API continue to trust only Keycloak. Provider client secrets belong in the deployment
secret store, not `chart-realm.json`.

The `chart-web` client adds `chart-api` as the access-token audience. The Python API
rejects correctly signed tokens issued for another audience.

For the Scope Google Workspace, start with Keycloak's Google provider using
`openid profile email` and set **Hosted Domain** to the Workspace domain. Microsoft
Entra can be added later as a tenant-specific OpenID Connect provider. Cognito is not
needed while Keycloak remains the broker.

An SSO login proves identity but does not grant CHART data access. New brokered users
must receive an approved CHART client role and geography group before protected
prediction routes allow them.

## Seed users

| Username             | Password   |
| -------------------- | ---------- |
| `chart-admin`        | `password` |
| `u1-health-region`   | `password` |
| `u2-sector-region`   | `password` |
| `u3-health-district` | `password` |
| `u4-sector-district` | `password` |

## Roles

Client roles on `chart-api`:

- `chart_admin`
- `content_editor`
- `health_planning_lead`
- `cross_sector_planning_lead`
- `health_implementation_officer`
- `cross_sector_implementation_officer`
- `public_viewer`

## Geography groups

Geography scope is represented by Keycloak groups. The local realm uses fixture groups; real deployments should load their own.

```
/india/madhya-pradesh
/india/madhya-pradesh/bhopal
/kenya/kajiado
/kenya/kajiado/kajiado-central
```
