# CHART Postgres

CHART uses one Postgres service for local/demo infrastructure.

Databases:

- `chart_cms`: Payload CMS content tables.
- `chart_keycloak`: Keycloak internal identity tables.
- `chart_app`: CHART-owned application tables.

The `chart_app` database owns geography, workspace, access, and solution repository
metadata. Keycloak only stores identity, roles, groups, and sessions.

Initial SQL files are mounted into `/docker-entrypoint-initdb.d` and run only when the
Postgres volume is first created. These files only create supporting databases.
CHART app tables are managed by Drizzle migrations from `api/src/db/schema.ts`.

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
