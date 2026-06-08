# CHART Solution Repository

This is the Payload-backed content service for CHART solution records.

It is intentionally separate from CHART core:

- CHART core does not import this app.
- CHART core reads published solutions from its Fastify API and local Drizzle read tables.
- This service owns content editing, media uploads, publishing workflow, and repository auth.

The folder is kept in this repository temporarily so it can be split into its own repository later.

## Local Development

```bash
make solution-repo
```

Open:

- Content studio: `http://127.0.0.1:3300`
- Payload admin: `http://127.0.0.1:3300/admin`
- Payload API: `http://127.0.0.1:3300/api`

Useful root commands:

```bash
make solution-repo-db
make solution-repo-seed
make solution-repo-stop
make solution-repo-verify
```

## Boundary

CHART consumes repository data through a published API or JSON snapshot.

```txt
solution-repository publishes data
        ↓
CHART api imports/syncs data
        ↓
CHART web reads from CHART api
```

Do not add CHART user/geography/workspace policy into this service. Those belong in `api/`.

## Structure

```txt
solution-repository/
  payload.config.ts
  src/app/(studio)/       # Repository content studio
  src/app/(payload)/      # Payload admin/API routes
  src/collections/        # Payload content models
  src/lib/                # Repository seed/import helpers
  src/seed-data/          # Standalone seed snapshot
```
