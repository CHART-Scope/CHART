# Keycloak

Keycloak is the identity system. CHART is the policy system (workspaces, roles at places, departments).

## Local start

```bash
make identity
make identity-sync
```

`make identity-sync` re-applies the realm settings, email-code sign-in and the seeded administrator to an existing realm. Run it after changing `chart-realm.json` or `sync-realm.js`, or after a volume reset.

Use `make identity-restart` after changing local theme files.

Local development uses the shared `chart-postgres` server with two isolated logical
databases: `chart` for the application and `chart_keycloak` for Keycloak. Keycloak
connects with its own `chart_keycloak` database role; it does not write to CHART's
application tables.

Admin console: `http://localhost:8080` — `admin` / `admin` — realm `chart`

## Sign-in

People sign in with their email address and a code Keycloak emails to them;
there are no passwords. `sync-realm.js` sets up the browser flow, the code
limits and the realm's SMTP server from `SMTP_*` settings, and stops before
changing anything when they are missing. The code step is the jar in
`providers/`, mounted into every Keycloak container. See
[sign-in and email](../../docs/sign-in.md) for the settings, providers, DNS and
upgrades.

Local codes land in Mailpit at `http://127.0.0.1:8025`.

The `chart` login theme (`themes/chart/login/`) styles both screens and
overrides two templates: `login-username.ftl` (the email step) and
`login-email-otp.ftl` (the provider's code step).

## Deployment images

`Dockerfile` builds what deployments run, so the server holds no Keycloak
files:

```bash
docker build -t chart-keycloak infra/keycloak                          # Keycloak + plugin, theme, realm seed
docker build --target config -t chart-keycloak-config infra/keycloak   # sync-realm.js
```

`chart-keycloak` is pre-built for PostgreSQL under `/identity` and starts with
`start --optimized --import-realm`. Local development keeps mounting these
files into stock Keycloak, so theme edits show on reload.

## Upstream SSO

Keycloak is CHART's identity broker and token issuer. Configure Google Workspace or
Microsoft Entra as an identity provider in the `chart` realm; the web app and Python
API continue to trust only Keycloak. Provider client secrets belong in the deployment
secret store, not `chart-realm.json`.

The `chart-web` client adds `chart-core` as the access-token audience. The Python API
rejects correctly signed tokens issued for another audience.

For the Scope Google Workspace, `make identity-sync` or the production deploy
upserts Keycloak's Google provider when these variables are present:

```bash
KEYCLOAK_GOOGLE_CLIENT_ID=<google-oauth-client-id>
KEYCLOAK_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
KEYCLOAK_GOOGLE_HOSTED_DOMAIN=scopeimpact.fi
CHART_WEB_ORIGIN=https://<chart-domain>
```

Configure the Google OAuth client with this authorized redirect URI:

```txt
https://<chart-domain>/identity/realms/chart/broker/scope-google/endpoint
```

The provider requests `openid profile email`, and Keycloak validates the returned
Google hosted-domain claim against `scopeimpact.fi`. Microsoft Entra can be added
later as a tenant-specific OpenID Connect provider. Cognito is not needed while
Keycloak remains the broker.

An SSO login proves identity but does not grant CHART data access. Access is
by invitation only: a brokered user holds nothing until someone invites their
verified email in CHART (Settings > People), and the invitation applies at their
first sign-in.

`CHART_WEB_ORIGIN` is also the source of truth for the `chart-web` callback, web
origins, and post-logout redirects. Use the canonical HTTPS origin in production;
do not use the EC2 IP address when users browse CHART through a domain.

`sync-realm.js` also applies each seeded client's flow switches
(`standardFlowEnabled`, `implicitFlowEnabled`, `directAccessGrantsEnabled`,
`serviceAccountsEnabled`) to an existing realm. `chart-web` is a public client
and only allows the authorization-code flow with PKCE; the password grant
(`directAccessGrantsEnabled`) is off, so nothing can trade a username and
password for a `chart-web` token directly.

## Seed users

One: the default administrator `admin`, created by `sync-realm.js` when the
realm has no `admin` (first password `CHART_ADMIN_INITIAL_PASSWORD`, default
`admin`, which must be changed at the first sign-in). It has the
`chart_admin` role, runs setup at `/onboarding` and invites everyone else.
An existing `admin` is never modified. It signs in with a password; every
other account signs in with an emailed code.

## Roles and access

Keycloak only proves who someone is. What they may do - their workspaces,
roles at places and departments - lives in CHART's database
([access control](../../docs/access-control.md)), and the API reads it on
every request.

The one client role on `chart-core` is `chart_admin`: it makes the seeded
account CHART's first platform admin while the installation has none.
Tokens carry no groups. Roles and groups from older realms are ignored.
