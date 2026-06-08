# CHART Postgres

CHART uses Postgres for app data and local identity infrastructure.

Recommended logical databases:

- `chart`: CHART app tables managed by Drizzle.
- `chart_keycloak`: Keycloak internal tables.

CHART-owned app tables are defined in `api/src/db/schema.ts` and managed through
Drizzle migrations. Do not store solution repository CMS tables in the CHART app
database; the repository CMS is a separate service boundary.

Keycloak remains the identity system. CHART remains the policy system for app-level
geography, workspace, source, and solution repository metadata.

Schema workflow:

```bash
make api-db-generate
make api-db-migrate
make api-db-seed
```

CI also runs `make api-db-check`, regenerates migrations, verifies there is no drift,
and applies migrations to a temporary Postgres service.

For a clean local database reset:

```bash
docker compose down -v
docker compose up -d chart-postgres chart-keycloak-postgres
make api-db-migrate
make api-db-seed
```
