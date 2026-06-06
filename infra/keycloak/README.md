# CHART Keycloak

Keycloak is the identity system. CHART remains the policy system.

## Local start

```bash
docker compose up -d chart-postgres chart-keycloak
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

Postgres is shared platform infrastructure. Local and deployed environments use one
database:

- `chart`: Payload CMS tables, Keycloak internal tables, and CHART-owned Drizzle
  tables.

Roles are Keycloak client roles on `chart-api`:

- `u1_health_lead`
- `u2_cross_sector_lead`
- `u3_district_health_officer`
- `u4_district_cross_sector_officer`
- `u5_public_visitor`
- `chart_admin`
- `content_editor`

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
