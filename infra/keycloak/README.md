# CHART Keycloak

Keycloak is the identity system. CHART remains the policy system.

## Local start

```bash
docker compose up -d chart-postgres chart-keycloak-postgres chart-keycloak
make identity-sync
```

`make identity-sync` re-applies the current seed groups and users to an existing
realm. Use it after changing `chart-realm.json` or when a local Postgres volume was
created from an older seed.

Use `make identity-restart` after changing local theme files. Keycloak caches theme
resources while the container is running.

Admin console:

- URL: `http://localhost:8080`
- Username: `admin`
- Password: `admin`
- Realm: `chart`

Seed users:

- `chart-admin` / `password`
- `u1-health-region` / `password`
- `u2-sector-region` / `password`
- `u3-health-district` / `password`
- `u4-sector-district` / `password`

## Model

Keycloak runs inside the CHART deployment, but its internal tables should stay separate
from CHART app tables:

- `chart`: CHART app tables managed by Drizzle.
- `chart_keycloak`: Keycloak internal tables.

Roles are Keycloak client roles on `chart-api`:

- `chart_admin`
- `content_editor`
- `health_planning_lead`
- `cross_sector_planning_lead`
- `health_implementation_officer`
- `cross_sector_implementation_officer`
- `public_viewer`

Older `u1_*` to `u5_*` token roles are accepted by the API as temporary aliases, but
new deployments should use the standard role names above.

Geography scope is represented by hierarchical Keycloak groups. The local realm uses
generic fixture groups only; real deployments should load their own geography reference
data and matching Keycloak groups.

- `/country-a/region-a`
- `/country-a/region-a/district-a`
- `/country-b/region-b`
- `/country-b/region-b/district-c`

The API reads `roles` and `groups` from the access token and builds the current user
context. The app database owns geography metadata, display labels, boundaries, solution
repository metadata, and future workspace access rules through Drizzle migrations.

The CHART login theme lives in `infra/keycloak/themes/chart` and is mounted into the
local and deployed Keycloak container.
