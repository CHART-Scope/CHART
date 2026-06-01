# CHART Keycloak

Keycloak is the identity system. CHART remains the policy system.

## Local start

```bash
docker compose up -d chart-postgres chart-keycloak
```

Admin console:

- URL: `http://localhost:8080`
- Username: `admin`
- Password: `admin`
- Realm: `chart`

Seed users:

- `u1-health-india` / `password`
- `u2-sector-kenya` / `password`
- `u3-health-gwalior` / `password`
- `u4-sector-loitokitok` / `password`

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

Geography scope is represented by hierarchical Keycloak groups:

- `/india/madhya-pradesh`
- `/india/madhya-pradesh/gwalior`
- `/kenya/kajiado`
- `/kenya/kajiado/loitokitok`

The API reads `roles` and `groups` from the access token and builds the current user
context. The app database owns geography metadata, display labels, boundaries, solution
repository metadata, and future workspace access rules through Drizzle migrations.

The CHART login theme lives in `infra/keycloak/themes/chart` and is mounted into the
local and deployed Keycloak container.
