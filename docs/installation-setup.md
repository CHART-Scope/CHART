# Installation setup

## The logins

| Who | Where | Username | Password |
| --- | --- | --- | --- |
| CHART's administrator | CHART, e.g. `https://chartforclimateaction.org` | `admin` | First `CHART_ADMIN_INITIAL_PASSWORD` (or `admin` if it was not set); you choose your own at the first sign-in |
| Everyone else | CHART | their email address | none: a 6-character code by email |
| Keycloak's operator account | `https://<domain>/identity/admin` | `admin` | `KEYCLOAK_ADMIN_PASSWORD` from `.env.prod` |

CHART's `admin` and Keycloak's `admin` are different accounts. Day-to-day
work, including inviting people, happens in CHART; the Keycloak console is
only for operating Keycloak and is not needed to set CHART up.

`infra/keycloak/sync-realm.js` creates CHART's `admin` once (local
`make identity-sync` and every deploy) and never changes it afterwards.
**Set `CHART_ADMIN_INITIAL_PASSWORD` in `.env.prod` before the first deploy
of a public server**, so it never starts on `admin`.

## First run

Until setup is done, CHART's front page says this too, so whoever deployed it
needs no server access to get in.

1. Open CHART and choose **Set up CHART** (or **Sign in**).
2. On **CHART login**, enter `admin` in the email field. The next page,
   **CHART admin**, asks for the first password; this account uses a password,
   not an emailed code.
3. Keycloak makes you choose a new password straight away. The first password
   stops working.
4. The setup wizard at `/onboarding` asks for the country, administrative
   area, primary sector and collaborating sectors, then **Launch CHART**. No
   setup token and no second administrator are needed: setup runs as `admin`
   (`POST /setup/complete`) and gives it the installed country.
5. CHART opens the dashboard for that country. Invite everyone else (below).

Before setup, `admin` lands on **Settings → Users**; only an administrator
can open `/onboarding`.

## Inviting people

Signed in as `admin` (or any CHART administrator):

1. Open **Settings → Users** and fill in **Invite a person**: full name,
   email address, role and planning area.
2. Choose **Send invitation**. They receive **You are invited to CHART**; the
   link works for 7 days.
3. They choose **Accept and sign in**, then sign in with their email address
   and the code CHART emails them. They land on their area's dashboard.

**Send invitation again** beside a person emails a fresh link. While Amazon
SES is in sandbox mode, an invitee's address must be verified in SES first,
or Settings reports that the invitation could not be sent. More detail:
[inviting people](sign-in.md#inviting-people).

## Passwords: what changing `.env.prod` does

Both admin passwords in `.env.prod` are read **only when the account is first
created**:

- `CHART_ADMIN_INITIAL_PASSWORD` sets CHART's `admin` first password at the
  deploy that creates the account. Changing it afterwards does nothing; the
  password is whatever `admin` chose.
- `KEYCLOAK_ADMIN_PASSWORD` is Keycloak's operator password from its very
  first start. Every deploy signs in to Keycloak with it, so it must keep
  matching: editing it in `.env.prod` without changing it in Keycloak makes
  the next deploy fail.

To change either one later, change it in Keycloak, and for the operator
account update `.env.prod` to match. From the server, with the current
operator password:

```bash
cd ~/chart-deploy/aws && set -a && . ./.env.prod && set +a
K=/opt/keycloak/bin/kcadm.sh
docker exec chart-keycloak $K config credentials --server http://localhost:8080/identity --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD"
# CHART's admin: a temporary password, changed at its next sign-in
docker exec chart-keycloak $K set-password -r chart --username admin --new-password 'Temp-ChangeMe-1' --temporary
# Keycloak's operator account: then put the same value in KEYCLOAK_ADMIN_PASSWORD
docker exec chart-keycloak $K set-password -r master --username admin --new-password '<new long password>'
```

Run one command per line; a long line wrapped in a terminal paste breaks.

## What setup does

`complete()` in `core/chart/setup/service.py`, called as the signed-in
administrator:

1. **Identity** — when the administrator's token does not already cover the
   chosen country, adds the account to that country's Keycloak group
   (`502 SETUP_IDENTITY_GROUP_FAILED` if Keycloak refuses; nothing is written).
2. **Complete** — upserts geography rows, creates the default workspace,
   records the administrator's `AppUser` row and scope, prepares the installed
   models, and marks setup `completed`.

Wizard state in the browser is held in a `zustand` store persisted to
`localStorage` under the key `chart:onboarding`, so refreshing mid-wizard does
not lose progress.

### Scripted installs

`POST /setup/bootstrap` with the `X-CHART-Bootstrap-Token` header
(`CHART_BOOTSTRAP_TOKEN`) still provisions an email-code administrator and
completes setup in one call, for automated installs. The web app no longer
uses it.

## Administrative area and fitted model area

The administrator selects the place they serve, not an internal model block.
For debugging and review, each area option also shows the mapping supplied by
the installed release manifest. After selection, the wizard lists every
available outcome and its fitted model area.

For example, onboarding displays Kajiado as a **County** and explains that its
LBW prediction uses the **South-eastern** fitted **climate-zone model**. The
county boundary still supplies the climate input; the climate-zone name selects
the response block. If a manifest supplies no mapping, onboarding does not
invent one.

## Running the stack locally

`make run` starts every process required for onboarding in one shot:

- **R inference service** (`lbw-run`, port 8000) — the DLNM scorer that owns
  compact model artifacts.
- **Python API** (`climate-api-run`, port 3210) — bootstrap, prediction,
  climate ingest.
- **Dagster** (`dagster-run`, port 3002) — background prediction sensor.
- **Web app** (`web`, port 3100) — the wizard and dashboard.

All four are launched with `-j4` so they come up in parallel. The Makefile
pre-wires the `MODEL_CONTROL_TOKEN` between R and Python so onboarding's
model-warming step succeeds without manual configuration.

You do **not** need to run `bash pipelines/models/run_registry_api.sh`
separately when using `make run` — that path is only for standalone R
development or debugging one process in isolation.

## Backend environment file

`core/.env` is loaded at startup by `chart/api/app.py:main()` via
`python-dotenv`. Anything the shell already has set (from the Makefile, a
process manager, or Docker) wins — the file only fills in what the process
environment hasn't provided. Edit values and restart the API for them to
take effect.

Two categories of setting live in different places:

- **Cross-service coordination values** (`INFERENCE_LBW_BASE_URL`,
  `MODEL_CACHE_DIR`, `MODEL_CONTROL_TOKEN`, `DATABASE_URL`,
  `CHART_BOOTSTRAP_TOKEN`) are set by the Makefile so the Python API and the
  R inference container always agree. They stay out of `.env` to avoid drift
  between the two processes.
- **Application behavior flags** (`CHART_ENABLE_REVIEW_MODELS`,
  `CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES`, `EMAIL_*`) live in `core/.env`
  because they don't need to match anything outside the API process.

In production, put these settings in the gitignored
`~/chart-deploy/aws/.env.prod` file on EC2. Docker Compose assigns each service
only the values declared in `infra/aws/docker-compose.yml`.

## Admin geography scope

By default an installation administrator sees exactly the geographies granted
by their Keycloak groups — the same strict scope every other user gets. Set
`CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES=true` in `core/.env` to widen the
admin's scope to every family root with an active model release, so the
Settings context switcher lists every geography the deployment holds (India,
Kenya, and any future country whose manifest ends up under
`pipelines/models/`).

Only the literal string `true` opts in — `"1"`, `"yes"`, and `"True"` are all
treated as false, so a typo cannot silently open scope up. The union runs
after the existing chart_admin country-level collapse, so both broadenings
compose cleanly. Non-admins are never affected.

If the flag is flipped off while an admin is signed in with a widened area
active, the frontend's remembered `X-Chart-Active-Geography` will point at a
geography now out of scope. `apply_active_geography` silently drops the stale
header and lands the session on the admin's original Keycloak country
instead of returning a 403. Direct route queries
(`/auth/geography-access?geography=...`) still enforce the scope, so this is
a UX fallback for stale client hints only.

## Model registry control token

`MODEL_CONTROL_TOKEN` is a shared secret between the Python backend and the R
inference service. The R side gates `/models/load` with an
`X-CHART-Model-Control-Token` header; the Python side sends that header when
warming a release. If the two tokens disagree, warming fails with
`403 Forbidden` and setup rolls back with `SETUP_MODEL_PREPARATION_FAILED`.

### Why it exists

`/models/load` accepts a `local_path` from the request body and tells R to
`readRDS()` that file. Two real risks if the endpoint were open:

1. **RDS deserialization is code execution.** `readRDS` materialises arbitrary
   R objects — a hostile `.rds` can execute code the moment it loads. An open
   port 8000 would be a remote-code-execution primitive.
2. **Silent model swap.** Even a benign attacker could load a wrong artifact
   and every subsequent prediction would return bad numbers.

The token means an accidentally exposed port (misconfigured proxy, firewall
gap, laptop on a coffee-shop WiFi) still can't be weaponised without the
shared secret. `/health` and `/predict` are unauthenticated because they
can't mutate state; `/models/load` is the one endpoint that changes what the
runtime holds.

### Local development

`make run` uses `chart-local-model-control` by default (defined at
`Makefile:LBW_MODEL_CONTROL_TOKEN`). Both R and Python read the same variable,
so no configuration is required for the golden path.

To override for a specific session, pass it on the command line:

```bash
make run LBW_MODEL_CONTROL_TOKEN=my-dev-token
```

Or set it in `core/.env` alongside the other model-runtime variables
(`INFERENCE_LBW_BASE_URL`, `MODEL_CACHE_DIR`, `CHART_ENABLE_REVIEW_MODELS`).
When you launch R by hand (rare), export the same value in that terminal.

### Production

Do not ship the default token. Generate a real secret per environment:

```bash
openssl rand -hex 32
```

Provision it into both the LBW container's environment and the Python API
container's environment through your deploy pipeline (the same way you inject
`POSTGRES_PASSWORD` or `CHART_BOOTSTRAP_TOKEN`). Rotate it by restarting both
services with the new value; there is no runtime handshake, so the two must
change together.

### Troubleshooting

**`MODEL_RUNTIME_UNAVAILABLE: HTTP Error 403: Forbidden`** — the two sides
have different tokens. If you started R by hand while `make run` was also
running, kill the manual R process and re-run `make run` so both sides pick
up the same default. If you set a custom token, verify both processes have
the same value exported.

**`MODEL_RUNTIME_UNAVAILABLE: <urlopen error [Errno 61] Connection refused`** —
the R service is not listening on `INFERENCE_LBW_BASE_URL`. Check that
`make run` completed `lbw-check` (Rscript present, self-tests pass) and that
port 8000 is free.

**`MODEL_RUNTIME_NOT_CONFIGURED`** — Python resolved an empty URL. Either
`INFERENCE_LBW_BASE_URL` is unset or `MODEL_CONTROL_TOKEN` is empty. Check
`core/.env`.

## Reset

The user-management page exposes a **Reset installation** button. It calls
`POST /setup/reset` (requires `chart_admin`) and:

- Deletes every workspace and workspace member.
- Deletes every `AppUser` row (cascades to `user_roles` and
  `user_geography_scopes`).
- Best-effort deletes the first administrator from Keycloak, unless it is the
  default `admin`, which stays to run setup again.
- Clears every field on `setup_state` — `phase` returns to `uninitialized`,
  tokens, hashes, and admin identifiers are nulled.

After reset, `admin` signs in and runs the wizard again.

## Troubleshooting

### The wizard shows a generic "could not finish installation setup" error

The Python API side almost always returns a specific `SETUP_*` code. The web
client at `web/src/lib/setupClient.ts` maps every known code to a targeted
message; the generic fallback only appears when the code is unrecognised.
Check the API logs for the actual `POST /setup/complete` response.

### `409 SETUP_BOOTSTRAP_LOCKED`

Setup already completed, or a workspace member exists. Either sign in as the
existing administrator, or hit the reset button to start over.

### `409 SETUP_BOOTSTRAP_IN_PROGRESS`

Another bootstrap call is running. Wait for it to finish, or wait
`SETUP_PROVISIONING_TIMEOUT_SECONDS` (default 600) for the stuck attempt to
time out.

### `409 SETUP_BOOTSTRAP_REQUEST_MISMATCH`

The `setup_state` row has a `provisioning_request_hash` from a prior attempt
that does not match the current payload. Either retry with the original
payload, or reset the installation and start again.

### `409 SETUP_IDENTITY_USER_CONFLICT`

The admin email you picked already exists in Keycloak under a different
provisioning saga (typically a leftover from a manual test or a partially
cleaned reset). Pick a different email, or use the [full cleanup](#full-local-cleanup)
steps below.

### `500` with `duplicate key value violates unique constraint "users_username_unique"`

A previous bootstrap wrote an `AppUser` row and then failed downstream. Later
bootstrap attempts try to insert a fresh row with the same username. The
current backend rolls back the identity + `AppUser` row automatically when
`complete()` throws (`_rollback_provisioned_identity` in `setup/service.py`).
If you are on an older build, run the [full cleanup](#full-local-cleanup) once
and rebuild.

## Full local cleanup

For local development only, when Keycloak and Postgres have drifted and reset
cannot recover:

```bash
# 1. Clear the setup_state row and any orphan users
docker exec chart-postgres psql -U chart -d chart <<'SQL'
DELETE FROM users;
UPDATE setup_state
   SET completed = false,
       phase = 'uninitialized',
       provisioning_token = NULL,
       provisioning_request_hash = NULL,
       provisioning_started_at = NULL,
       last_error_code = NULL,
       first_admin_user_id = NULL,
       first_admin_email = NULL
 WHERE id = 'default';
SQL

# 2. Log in to Keycloak admin and delete every user in the `chart` realm
docker exec chart-keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master \
  --user admin --password admin

for id in $(docker exec chart-keycloak /opt/keycloak/bin/kcadm.sh \
              get users -r chart --fields id \
            | grep -oE '"[a-f0-9-]{36}"' | tr -d '"'); do
  docker exec chart-keycloak /opt/keycloak/bin/kcadm.sh delete users/$id -r chart
done
```

For a full Keycloak nuke (drop the database and re-seed from
`infra/keycloak/chart-realm.json`), use `make identity-reset CONFIRM=1`.

## Related

- Wizard component: `web/src/features/onboarding/OnboardingWizard.tsx`
- Persisted store: `web/src/features/onboarding/store.ts`
- Reset flow: `core/chart/setup/service.py:reset`
- Realm seed (no users, no groups): `infra/keycloak/chart-realm.json`
