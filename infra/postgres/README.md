# CHART Postgres

CHART uses one Postgres service and one database for local and deployed infrastructure.

Database:

- `chart`: shared runtime database.

CHART-owned app tables are defined in `api/src/db/schema.ts` and managed through
Drizzle migrations. Payload CMS and Keycloak also connect to the same `chart`
database and manage their own internal tables.

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
docker compose up -d chart-postgres
make api-db-migrate
make api-db-seed
```
