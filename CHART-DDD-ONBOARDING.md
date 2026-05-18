# CHART DDD Onboarding Guide

**Audience:** engineers joining CHART Sprint 3 work  
**Purpose:** give the repo a clear development shape before more backend code is added.

## Why this is useful

The wallet guide is useful for CHART because it gives:

- a consistent folder vocabulary
- a clear rule for where business logic should live
- a way to separate domain behavior from transport and providers
- a predictable reading order for new contributors

We should use the pattern, not copy the wallet implementation.

## What to keep

Use the same four-layer structure inside each CHART module:

| Layer | Responsibility | Typical contents | Rule |
| --- | --- | --- | --- |
| `contracts/` | bounded-context language | API types, ids, errors, domain primitives | no database or framework code |
| `core/` | business meaning | command handlers, entities, value objects, policies, events | use cases live here |
| `infra/` | concrete adapters | Postgres repositories, auth/session adapters, external data clients | talks to real systems |
| `interface/` | transport edge | Express route handlers, request decoding, response mapping | thin edge only |

## What not to copy

Do **not** copy wallet-specific things like:

- Cognito trigger structure
- OTP challenge orchestration
- provider-specific runtime wiring
- auth flows that only make sense for mobile sign-in

CHART needs the same structure, but different bounded contexts.

## CHART bounded contexts

For Sprint 3, the useful bounded contexts are:

| Context | Purpose |
| --- | --- |
| `user-management` | users, roles, geography scope |
| `planning-workspace` | shared planning context for `U1` and `U2` |
| `dashboard` | region overview and read models for indicators |
| `data-ingestion` | climate, health, population, and geography inputs |

## First module to build

Start with:

1. `user-management`
2. `planning-workspace`

These are the base for everything else.

## Suggested repo shape

```txt
apps/api/src/modules/
  user-management/
    contracts/
    core/
    infra/
    interface/
  planning-workspace/
    contracts/
    core/
    infra/
    interface/
  dashboard/
    contracts/
    core/
    infra/
    interface/
  data-ingestion/
    contracts/
    core/
    infra/
    interface/
```

## CHART mental model

For CHART, the equivalent takeaway is:

**The API owns the transport contract, the module owns the business meaning, and infra owns storage or provider integration.**

## User-management module

This should answer:

- who is the user
- what role do they have
- what geography can they access
- what planning workspace can they belong to

### Suggested language

| Area | Example concepts |
| --- | --- |
| `contracts/` | `UserId`, `Role`, `GeographyScope`, `WorkspaceId`, `AccessError` |
| `core/` | `assignRole`, `assignGeographyScope`, `attachUserToWorkspace`, `getCurrentUserContext` |
| `infra/` | Postgres repositories, auth/session lookup |
| `interface/` | `GET /me`, `GET /workspaces/current/members` |

## Planning-workspace module

This should answer:

- what planning context is active
- which geography is selected
- which users are collaborating
- which planning cycle or period is in view

### Suggested language

| Area | Example concepts |
| --- | --- |
| `contracts/` | `PlanningWorkspace`, `WorkspaceMember`, `ActiveGeography`, `PlanningCycle` |
| `core/` | `createWorkspace`, `selectActiveGeography`, `addMember`, `getWorkspaceContext` |
| `infra/` | Postgres repositories |
| `interface/` | `GET /workspaces/current`, `POST /workspaces/current/select-geography`, `POST /workspaces/current/members` |

## Read order for CHART contributors

Read in this order:

| Order | Read |
| --- | --- |
| 1 | `packages/shared/src/domain/` |
| 2 | `apps/api/src/modules/*/contracts/` |
| 3 | `apps/api/src/modules/*/core/` |
| 4 | `apps/api/src/modules/*/infra/` |
| 5 | `apps/api/src/modules/*/interface/` |
| 6 | `apps/web/src/modules/` |

That keeps domain meaning ahead of transport and UI.

## Good first API contract

For the first backend slice, keep it small:

| Route | Purpose |
| --- | --- |
| `GET /me` | current user, role, geography scope |
| `GET /workspaces/current` | current planning workspace |
| `GET /workspaces/current/members` | current workspace members |
| `POST /workspaces/current/members` | add a workspace member |
| `POST /workspaces/current/select-geography` | set active geography |

## Rule of thumb

If you are changing:

| Change | Look first in |
| --- | --- |
| business behavior | `core/` |
| error vocabulary or shared types | `contracts/` |
| database or provider integration | `infra/` |
| HTTP request/response mapping | `interface/` |

## What this means for CHART now

The immediate next step is not more generic architecture notes.

The immediate next step is:

1. create `user-management` module folders
2. define contracts
3. define minimal API contract
4. define core handlers
5. add infra stubs
6. wire thin interface handlers

## Final takeaway

Use the wallet guide as a **development pattern**.

For CHART:

- keep the layered module structure
- keep domain language explicit
- keep interfaces thin
- keep infra replaceable
- start with `user-management` and `planning-workspace`
