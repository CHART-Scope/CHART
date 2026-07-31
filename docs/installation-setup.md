# Installation setup

CHART ships without any pre-seeded users, groups, or workspaces. The first time
you open the web application after `make run`, the browser redirects to the
installation setup wizard at `/onboarding`. The wizard collects the country,
administrative area, primary sector, collaborating sectors, and the first
administrator account, then provisions Keycloak and Postgres in one atomic
saga.

## What the wizard does

Backend endpoint: `POST /setup/bootstrap` (proxied through the web app at
`/api/setup/bootstrap`).

Handler: `bootstrap()` in `backend/chart/setup/service.py`.

The saga in order:

1. **Claim** — `_claim_bootstrap` acquires a lock on the `setup_state` row,
   mints an `operation_id`, and moves `phase` from `uninitialized` to
   `provisioning`. Concurrent bootstrap calls with the same payload resume the
   same saga; mismatched payloads return `409 SETUP_BOOTSTRAP_REQUEST_MISMATCH`.
2. **Identity** — `upsert_user` creates or updates the Keycloak user in the
   `chart` realm, sets a `chartProvisioningOperation` attribute matching the
   `operation_id`, assigns geography groups, and grants the `chart_admin` +
   `content_editor` client roles.
3. **Complete** — `complete()` upserts geography rows, creates the default
   workspace, inserts the admin `AppUser` row, marks setup `completed`, and
   returns the fresh status.

Wizard state in the browser is held in a `zustand` store persisted to
`localStorage` under the key `chart:onboarding`. Refreshing the page mid-wizard
does not lose progress. The administrator password is deliberately excluded
from the persisted slice and lives only in memory.

## Reset

The user-management page exposes a **Reset installation** button. It calls
`POST /setup/reset` (requires `chart_admin`) and:

- Deletes every workspace and workspace member.
- Deletes the first administrator's `AppUser` row (cascades to `user_roles`
  and `user_geography_scopes`).
- Best-effort deletes the same user from Keycloak via the admin REST API.
- Clears every field on `setup_state` — `phase` returns to `uninitialized`,
  tokens, hashes, and admin identifiers are nulled.

After reset, the same admin email may be reused for a fresh onboarding.

## Troubleshooting

### The wizard shows a generic "could not finish installation setup" error

The Python API side almost always returns a specific `SETUP_*` code. The web
client at `web/src/lib/setupClient.ts` maps every known code to a targeted
message; the generic fallback only appears when the code is unrecognised.
Check the API logs for the actual `POST /setup/bootstrap` response.

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
- Reset flow: `backend/chart/setup/service.py:reset`
- Realm seed (no users, no groups): `infra/keycloak/chart-realm.json`
