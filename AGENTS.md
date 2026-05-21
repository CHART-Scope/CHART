# CHART Agent Guide

## Purpose

This file defines the working rules for the whole CHART project.

Use it to keep generated code:

- consistent
- small
- testable
- easy to refactor

## Stack

- Backend: `Fastify + TypeScript`
- Frontend: `React + Vite`
- Database: `Postgres`
- Formatter: `Prettier`

## Project priorities

Build in this order:

1. `auth`
2. `data-ingestion`
3. `planning-workspace`
4. `dashboard`
5. `planning`
6. `budget-justification`

## General coding rules

- Prefer simple code over abstract code.
- Prefer small files over large multi-purpose files.
- Prefer named exports over default exports.
- Keep functions focused on one job.
- Keep route handlers thin.
- Keep business logic out of UI components.
- Do not add dependencies unless there is a clear reason.
- Do not invent new folder patterns unless needed.
- Refactor only when there is actual code pressure, not in advance.

## Naming conventions

### Files

- Use `kebab-case` for folders.
- Use `camelCase.ts` for backend utility or service files when file names match function purpose.
- Use `PascalCase.tsx` for React components.
- Use explicit suffixes when useful:
  - `types.ts`
  - `service.ts`
  - `routes.ts`
  - `routes.test.ts`

### Types

- Use `PascalCase` for type names.
- Use clear domain names:
  - `CurrentUser`
  - `SourceMetadata`
  - `PlanningWorkspace`
- Use string unions for small closed sets.

### Functions

- Use `camelCase`.
- Use verbs for behavior:
  - `getCurrentUser`
  - `listSources`
  - `queueSourceSync`
  - `registerAuthRoutes`
- Avoid vague names like:
  - `handleData`
  - `processThing`
  - `doStuff`

### Constants

- Use `camelCase` for local constants.
- Use `UPPER_SNAKE_CASE` only for true constants shared across a module or app.

## Function writing rules

- Keep functions short and direct.
- Pass explicit inputs.
- Return explicit outputs.
- Avoid hidden mutation unless the purpose is obvious.
- Prefer early returns over deep nesting.
- If a function needs a long comment to explain itself, simplify the function first.

Good:

```ts
export function getSourceById(sourceId: string): SourceMetadata | undefined {
  return sources.find((source) => source.id === sourceId);
}
```

Avoid:

```ts
export function processData(input: any) {
  // many unrelated branches and side effects
}
```

## Backend structure

Start simple.

Use this module shape first:

```txt
module/
  types.ts
  service.ts
  routes.ts
  routes.test.ts
```

Only split further if the module grows.

Possible later shape:

```txt
module/
  contracts/
  core/
  infra/
  interface/
```

## Backend route rules

- Use Fastify route registration functions:
  - `registerAuthRoutes`
  - `registerDataIngestionRoutes`
- Route files define endpoints only.
- Route handlers should:
  - read params/body
  - call a service function
  - map result to HTTP response
- Route handlers should not contain business workflows.
- Keep error responses explicit and stable.

Example pattern:

```ts
app.get("/:sourceId", async (request, reply) => {
  const params = request.params as { sourceId: string };
  const source = getSourceById(params.sourceId);

  if (!source) {
    reply.code(404);
    return { error: "SOURCE_NOT_FOUND" };
  }

  return source;
});
```

## Backend service rules

- Put module behavior in `service.ts`.
- Keep services framework-light.
- Services may use in-memory data first, then move to database adapters later.
- When service complexity grows, split by behavior:
  - `getCurrentUser.ts`
  - `queueSourceSync.ts`

## Frontend structure

- Keep frontend code under `apps/web/src/`.
- Prefer feature folders under `apps/web/src/modules/`.
- Keep shared app shell code under `apps/web/src/app/`.
- Put static content or seed-like UI data close to the module using it.

## Frontend component rules

- Use `PascalCase` component names.
- One file should usually export one main component.
- Keep components presentational unless they clearly own page behavior.
- Break large pages into sections when readability drops.
- Prefer mapping arrays into small UI blocks instead of duplicating markup.
- Keep copy concise.

Good component naming:

- `PublicLandingPage`
- `ResourceSectionCard`
- `AccessSummary`

## Frontend state rules

- Keep state local until sharing is necessary.
- Do not introduce state libraries early.
- Prefer props and simple React state first.
- Add heavier structure only when multiple modules truly depend on shared state.

## Types and data rules

- Prefer explicit TypeScript types over `any`.
- Model domain data first, UI formatting second.
- Keep API response shapes stable once introduced.
- Seed data is acceptable early if clearly named and easy to replace later.

## Testing rules

- Every new backend route should have a `routes.test.ts`.
- Use `Fastify.inject()` for route-level tests.
- Keep tests focused on observable behavior.
- Add service-level tests when logic gets heavier.
- Prefer a few good tests over many shallow tests.

Current useful test levels:

- route tests for API behavior
- later service tests for business rules

## Formatting and validation

Before finishing backend work, run:

```bash
make format
make api-test
make api-build
```

Before finishing frontend work, run:

```bash
make format
make web-build
```

## Product rules

- Public content stays accessible without login.
- Authenticated features should be scoped to role and geography.
- Build for the `U1` and `U2` flow first.
- Prefer simple seeded data before adding real integrations.
- Keep the first user flow understandable before making it comprehensive.

## Architecture references

Read when needed:

- `CHART-HIGH-LEVEL-MODULE-DESIGN.md`
- `CHART-DDD-ONBOARDING.md`
