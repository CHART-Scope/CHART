# CHART Repository

This is the Payload-backed content service and public API for CHART repository records.

It is intentionally separate from CHART core:

- CHART core does not import this app.
- CHART core reads published repository data from this service's public API, or from a local snapshot when this service is not configured.
- This service owns content editing, media uploads, publishing workflow, and repository auth.

The folder is kept in this repository temporarily so it can be split into its own repository later.

## Local Development

```bash
make chart-repo
```

Open:

- Content studio: `http://127.0.0.1:3300`
- Payload admin: `http://127.0.0.1:3300/admin`
- Payload API: `http://127.0.0.1:3300/api`
- Public API: `http://127.0.0.1:3300/api/public/openapi.json`

Public API routes:

- `GET /api/public/hazards`
- `GET /api/public/hazards/:hazardId`
- `GET /api/public/health-implications`
- `GET /api/public/solutions`
- `GET /api/public/solutions/taxonomies`
- `GET /api/public/solutions/:slug`

Useful root commands:

```bash
make chart-repo-db
make chart-repo-seed
make chart-repo-stop
make chart-repo-verify
```

## Boundary

CHART consumes repository data through a published API or JSON snapshot.

```txt
chart-repository publishes data
        ↓
CHART api imports/syncs data
        ↓
CHART web reads from CHART api
```

Do not add CHART user/geography/workspace policy into this service. Those belong in `api/`.

## Structure

```txt
chart-repository/
  payload.config.ts
  src/app/(studio)/       # Repository content studio
  src/app/(payload)/      # Payload admin/API routes
  src/app/api/public/     # Unauthenticated public repository API
  src/collections/        # Payload content models
  src/lib/                # Repository seed/import helpers
  src/seed-data/          # Standalone seed snapshot
```
