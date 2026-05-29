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

Demo users:

- `u1-health-india` / `password`
- `u2-sector-kenya` / `password`
- `u3-health-gwalior` / `password`

## Model

Postgres is shared platform infrastructure:

- `chart_cms` is used by Payload CMS.
- `chart_keycloak` is used by Keycloak internal tables.
- `chart_app` is used by CHART-owned app tables such as geography metadata and
  workspace access.

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
