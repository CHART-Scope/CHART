# CHART Agent Guide

## Purpose

This guide keeps generated code consistent across the whole CHART repo.

Generated code should be:

- consistent
- small
- testable
- easy to refactor

## Project Shape

CHART is a monorepo. Do not treat the root as a Next app.

- `web`: CHART Next web app.
- `api`: Fastify backend API.
- `solution-repository`: separate Payload CMS service for maintaining published solution repository data. It is not required to run CHART core.
- `data/`: local generated seed/import outputs, ignored by git.
- `docs/`: local planning notes, ignored by git.

Future Python or data-processing services should be added as separate apps or services, not inside `web`.

## Directory Boundaries

Use this structure:

```txt
api/
  src/modules/solution-repository/
    routes.ts
    service.ts
    types.ts
    seed-data/

web/
  src/modules/solutions/
  src/lib/solutionRepositoryClient.ts

solution-repository/
  payload.config.ts
  src/collections/
  src/app/(payload)/
  src/lib/
  Dockerfile
  docker-compose.yml
```

The two solution-repository directories mean different things:

- `api/src/modules/solution-repository`: CHART adapter and routes for reading a public repository snapshot/API. It must not define repository-owned Drizzle tables.
- `solution-repository`: standalone Payload CMS service that owns editing, media, publishing workflow, and repository auth.

Dependency direction:

```txt
solution-repository publishes data
        ↓
api reads public snapshot/API responses
        ↓
web reads from api
```

Never import from `solution-repository/` into `api/` or `web/`. Use an HTTP API or public JSON snapshot instead.

## Current Stack

- Web: Next, React.
- API: Fastify, TypeScript.
- Database: Postgres.
- Formatting: Prettier.

## Project Priorities

Build in this order:

1. `auth`
2. `data-ingestion`
3. `planning-workspace`
4. `dashboard`
5. `planning`
6. `budget-justification`

## General Rules

- Prefer simple code over abstract code.
- Prefer small files over large multi-purpose files.
- Prefer named exports over default exports.
- Keep functions focused on one job.
- Keep route handlers thin.
- Keep business logic out of UI components.
- Do not add dependencies unless there is a clear reason.
- Do not invent new folder patterns unless needed.
- Refactor only when there is actual code pressure.

## Backend Module Shape

Start simple:

```txt
module/
  types.ts
  service.ts
  routes.ts
  routes.test.ts
```

Use `routes.ts` for HTTP endpoints and `service.ts` for behavior. If a module grows, split it later into clearer subfolders.

Every new API route should have a route-level test using `Fastify.inject()`.

## Backend Route Rules

- Route files define endpoints only.
- Route handlers should read params/body, call service functions, and map results to HTTP responses.
- Route handlers should not contain business workflows.
- Keep error responses explicit and stable.

## Frontend Module Shape

Keep feature UI under `web/src/modules/`.

- Use `PascalCase.tsx` for React components.
- Keep shared shell/layout code under `web/src/app/`.
- Keep static copy and seed-like UI data close to the module using it.
- Use simple props/state first; avoid state libraries until shared state is actually needed.

## Naming

- Folders: `kebab-case`.
- Backend files: `types.ts`, `service.ts`, `routes.ts`, `routes.test.ts`.
- React components: `PascalCase.tsx`.
- Functions: `camelCase` with clear verbs, such as `getCurrentUser` or `listSources`.
- Types: `PascalCase`.
- Constants: `camelCase`, unless the value is a true cross-module constant.

## Product Rules

- Public content and the action repository stay accessible without login.
- Authenticated features should be scoped to role and geography.
- Build for the health planning lead and cross-sector planning lead flow first.
- Prefer simple seeded data before adding real integrations.
- Keep the first user flow understandable before making it comprehensive.
- Do not make CHART core depend on Payload CMS. CHART should consume the published solution repository through the Fastify adapter and public snapshots or a remote API, not CHART Drizzle tables.

## Validation

Before finishing backend work:

```bash
make api-test
make api-build
```

Before finishing frontend work:

```bash
make web-build
make web-typecheck
```

Before finishing broad repo work:

```bash
make format-check
```
