# CHART Backend Module Guide

## Purpose

This is a simple guide for how to grow the CHART backend.

Current choices:

- API framework: `Fastify`
- first backend modules: `auth` and `data-ingestion`

## Main idea

The structure is a pattern, not a rigid rule.

The point is:

- keep business logic separate from route handlers
- keep database and source adapters separate from business logic
- start small, then split further only when needed

## Start simple

A module can start like this:

```txt
module/
  types.ts
  service.ts
  routes.ts
  routes.test.ts
```

That is enough for an early module.

Later, if the module grows, it can become:

```txt
module/
  contracts/
  core/
  infra/
  interface/
```

## What the larger structure means

| Folder       | Purpose                                        |
| ------------ | ---------------------------------------------- |
| `contracts/` | types, ids, errors, request/response shapes    |
| `core/`      | business logic and use cases                   |
| `infra/`     | database adapters and external source adapters |
| `interface/` | Fastify routes and request/response mapping    |

You do **not** need to start with all four folders if the module is still small.

## First CHART backend modules

### `auth`

Responsibility:

- identify the current user
- resolve role
- resolve geography scope
- return current session context

Good first files:

```txt
auth/
  types.ts
  service.ts
  routes.ts
  routes.test.ts
```

Likely later split:

```txt
auth/
  contracts/
  core/
  infra/
  interface/
```

### `data-ingestion`

Responsibility:

- load or sync climate data
- load or sync health data
- load geography and population data
- record source metadata and provenance

Good first files:

```txt
data-ingestion/
  types.ts
  service.ts
  routes.ts
  routes.test.ts
```

If it grows, split into source-specific adapters later.

## Fastify fit

Use Fastify as the HTTP edge.

That means:

- `routes.ts` defines endpoints
- route handlers stay thin
- handlers call module services
- services hold the real logic
- route tests can use `Fastify.inject()`

## First useful routes

### `auth`

| Route     | Purpose                             |
| --------- | ----------------------------------- |
| `GET /me` | current user, role, geography scope |

### `data-ingestion`

| Route                    | Purpose                 |
| ------------------------ | ----------------------- |
| `GET /sources`           | list configured sources |
| `GET /sources/:id`       | source metadata         |
| `POST /sources/:id/sync` | trigger a sync or load  |

## Working rule

If you are changing:

| Change                         | Start here                  |
| ------------------------------ | --------------------------- |
| route shape                    | `routes.ts` or `interface/` |
| business behavior              | `service.ts` or `core/`     |
| source/database implementation | `infra/`                    |
| types and errors               | `types.ts` or `contracts/`  |

## Tests

Keep tests close to module behavior.

For now, simple route-level tests are enough:

- `routes.test.ts` for endpoint behavior
- later `service.test.ts` if module logic grows

The important part is that tests describe expected behavior, not framework detail.

## Build order

1. `auth`
2. `data-ingestion`
3. `planning-workspace`
4. `dashboard`
5. `planning`
6. `budget-justification`

## Rule of thumb

Start with:

- few modules
- few files
- clear names
- thin routes

Only add more structure when the code starts to pull apart naturally.
