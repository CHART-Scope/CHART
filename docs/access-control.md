# Users, departments and capabilities (design)

Status: **built** (decisions recorded 12 Nov 2026 under
[Decisions](#decisions)). Steps 1 to 5 of the [delivery order](#delivery-order)
are in place, as is department ownership of data sources and VRA indicator
groups. Assigning actions to departments waits for the action status work.
Sign-in and invitation emails are in [Sign-in](sign-in.md).

## Why change

Today Keycloak decides what a person may do: their roles are `chart-core`
client roles and their planning area is their Keycloak group, both read from
the access token. The database keeps copies (`user_roles`,
`user_geography_scopes`) that nothing keeps in step. As a result:

- an existing person cannot have their role or area changed, and disabling
  someone does not stop tokens already issued;
- seven role names are repeated in about ten places (realm JSON, Python role
  sets, TypeScript types, inline lists), and `content_editor` is never checked;
- "health" and "cross-sector" leads and officers are separate roles, when the
  difference is really the person's department;
- departments are a separate list that grants nothing, seeded from a
  hard-coded list inside a `GET`, with no way to rename or remove one;
- workspaces exist only to mark setup as complete.

## Principles

1. **Keycloak authenticates, CHART authorises.** Keycloak proves who someone
   is (email code, password for the platform admin, Google). Everything about
   what they may do lives in CHART's database and is checked on every request,
   so a change takes effect at once.
2. **Code defines capabilities, data defines everything else.** The list of
   capabilities is fixed in code, because code is what enforces them. Roles,
   departments, memberships and invitations are rows that administrators
   manage. No department or role name is an enum.
3. **One check.** Every protected operation calls
   `authorize(principal, capability, place=…, department=…)` in a new
   `chart.access` module. Routes and the web app never compare role names.
4. **Never grant more than you hold.** A person can only invite or assign
   roles, places and departments within what they have themselves.

## The model

```
User (Keycloak sub, email, status)
 ├─ is_platform_admin            installation-wide (the seeded "admin")
 └─ Membership ──► Workspace (one per country)
      ├─ grants: 1..n of (Role, Place)
      │     Role ──► capability levels (module + level)
      │     Place = a geography and everything below it
      └─ departments: 0..n ──► Department (per workspace, editable)
```

- **Platform admin** (`users.is_platform_admin`): may do everything in every
  workspace, create workspaces (countries) and manage other platform admins.
  This replaces `chart_admin` and the `CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES`
  switch.
- **Workspace**: the country planning space. The existing `workspaces` table
  becomes real: one per country, created when a country is set up.
- **Membership**: a person's standing in a workspace: one or more **grants**
  and their departments. One person can belong to several workspaces (for
  example a regional adviser).
- **Grants**: a role at a place. A grant covers the place and everything
  below it, so someone can be Planning lead for Bhopal and Viewer for the
  rest of Madhya Pradesh. Where grants overlap, the higher level wins, module
  by module.
- **Context above your places**: every member can **read** the places above
  their grants (a district officer sees their state's and country's figures),
  with the read levels of their role. Writes stay inside their grants.
- **Departments**: per-workspace rows (Health, Water, …) that people belong
  to. They are both an attribute (who does this work) and a scope for actions
  (see below).

### Capabilities

A capability is a **module** plus a **level**. Each level includes the ones
below it: `read` < `write` < `manage`.

| Module | read | write | manage |
| --- | --- | --- | --- |
| `risk` | dashboards, outlooks, projections | run predictions and what-if | model settings, releases |
| `data` | data coverage | upload data and start pulls for **your departments' sources** | any source, ingestion jobs |
| `vra` | VRA results | upload values and run assessments for **your departments' indicators** | any indicator, templates, frames |
| `actions` | action repository and status | start, update and comment on actions for **your departments** | assign actions to any department or person |
| `plans` | saved plans you can see | save and remove your plans | others' plans |
| `seasons` | heat-season calendars | — | edit calendars |
| `people` | workspace members | invite within your places | change roles, places and departments; disable |
| `departments` | department list | add a department | rename, archive |
| `workspace` | — | — | workspace settings |

New modules (for example hydrology or resilience assessments) add a row in
code. The default roles below then get a level for it in a migration.

### Default roles (seeded per workspace, editable later)

| Role | risk | data | vra | actions | plans | seasons | people | departments | workspace |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workspace admin | manage | manage | manage | manage | manage | manage | manage | manage | manage |
| Planning lead | write | read | read | manage | write | read | write | write | — |
| Implementation officer | read | read | read | write | write | read | read | read | — |
| Data officer | read | write | write | read | read | read | read | read | — |
| Viewer | read | read | read | read | read | read | read | read | — |

How today's roles map across:

| Today | Becomes |
| --- | --- |
| `chart_admin` | platform admin, plus Workspace admin in their country |
| `health_planning_lead`, `cross_sector_planning_lead` | Planning lead, with department Health or their sector |
| `health_implementation_officer`, `cross_sector_implementation_officer` | Implementation officer, with department as above |
| `content_editor` | dropped (never checked). Action content is curated in Airtable |
| `public_viewer` | Viewer |

Signed-out visitors (with `CHART_PUBLIC_READ`) keep a built-in principal that
has `read` on `risk` and `actions` only.

### Departments as scope

Departments limit writes in three modules: actions, data and VRA. They never
limit reading.

- `actions:write` lets a person start and update actions whose department
  is one of theirs. `actions:manage` covers any department and assigning
  people.
- An action from the repository names departments as free text (from the
  Airtable feed). When it is started in a workspace, it is linked to the
  workspace's department rows. If the feed names a department the workspace
  lacks, the link waits until a lead maps or adds the department.
- **Data and VRA**: each data source (for example ERA5, a hydrology feed, a
  health register) and each VRA indicator group can name owning departments,
  set by a Workspace admin. `data:write` and `vra:write` apply to sources and
  indicators owned by one of your departments. `manage` covers all of them.
  A source or indicator with no owner is open to anyone with `write`, so a
  new source is never locked out before it is assigned.
- Departments grant nothing on their own. They narrow what a role's `write`
  level reaches.

### Departments are data

- When a workspace is created, it is seeded from a default list in seed data
  (Health, Climate change, Environment, Water, Disaster management, Urban
  development, Labour). It is not seeded on first read.
- `departments:write` adds one and `departments:manage` renames or archives.
  Archiving hides a department from pickers but keeps it on past
  assignments, so history stays readable. A department with no members or
  assignments can be deleted.
- Names are unique per workspace, ignoring case.

## Invitations

An `invitation` row records each invite: workspace, email, role, places,
departments, who invited, status (`pending`, `accepted`, `revoked`,
`expired`) and expiry (7 days).

1. A person with `people:write` invites an email address. They choose one or
   more grants (a role at a place), each no higher than a grant they hold
   over that place, and departments. With
   `departments:write` they can create a missing department from the same
   form.
2. CHART creates the Keycloak account (email code sign-in, no password) if
   it does not exist and sends the invitation email. Inviting someone who
   already has an account in another workspace just adds a pending
   membership. It is not a conflict.
3. On first sign-in, the API matches the Keycloak `sub` (or verified email)
   to the pending invitation and activates the membership. The person lands
   in that workspace. Someone who signs in with no membership and no
   invitation sees "Ask your workspace admin for access".
4. Invitations can be resent or revoked while pending. Expired ones can be
   renewed.

Changing a member's role, places or departments, or disabling them, needs
`people:manage`, and takes effect on their next request. Disabling also
signs them out in Keycloak.

## Requests and sign-in

- The API still verifies the Keycloak token (issuer, audience, signature). It
  then loads the **principal** from the database by `sub`: user status,
  platform flag, and memberships with their roles, places and departments.
  This is cached for about 30 seconds per user and cleared when that user's
  access changes.
- The token no longer needs `groups` or CHART client roles. The `groups`
  mapper and the `chart-core` roles are removed after migration.
- A request names its workspace (the active country, as the
  `X-Chart-Active-Geography` header does today). `authorize` finds the
  grants covering the place being read or written (and, for reads, the
  grants below it), takes the highest level per module, then applies the
  department rule for actions, data and VRA.
- `GET /auth/me` returns, for each workspace, the grants (role, place
  and capability levels), the departments, and the workspaces the person
  can switch to. The web works out the level at the place on screen with
  the same rule. The web app shows and hides by capability
  (`can("people", "write")`), never by role name.
- Sign-in, the session and the 30-minute idle timeout are unchanged.

## Seeding and local setup

- **Platform admin**: `sync-realm.js` still creates the `admin` Keycloak
  account with password sign-in. On first sign-in (or `POST /setup/complete`)
  CHART marks it as platform admin. `chart-admin-recover` restores the flag
  and re-enables the account.
- **Workspace setup**: completing setup for a country creates the workspace,
  the default roles and the default departments, and gives the setting-up
  admin a Workspace admin grant on the whole country.
- **Access is by invitation only.** Someone who signs in (by email code or
  Google) with no membership and no pending invitation is told to ask a
  workspace admin. No account or request is created for them.
- **Local test users**: a `make seed-people` target creates one disposable
  person per default role in the local workspace (email-code sign-in through
  Mailpit), so each role can be tried by hand. This target never runs in
  production.

## Settings screens

| Tab | Who sees it | What it does |
| --- | --- | --- |
| People | `people:read` | Members with their grants and departments. Invite, resend, revoke (`write`); change grants and departments, disable (`manage`) |
| Departments | `departments:read` | List with member counts and the data sources and VRA indicators each owns. Add (`write`); rename, archive, delete (`manage`). Each person ticks their own departments |
| Roles | Workspace admin | The capability table for each role, read only. Nobody edits role capabilities in this version |
| Workspaces | platform admin | Countries on this installation; create one; switch |

The current Workspace tab's departments and members cards move into People
and Departments. User management stops listing every country's users.

## Schema outline

New or changed tables (one migration, with a backfill from `user_roles`,
`user_geography_scopes` and `user_department`):

- `users`: add `is_platform_admin`. `last_seen_at` is written on sign-in.
- `workspaces`: one per country (`country_code` unique). Drop `owner`.
- `role` (`id`, `workspace_id`, `name`, `is_default`), and `role_capability`
  (`role_id`, `module`, `level`).
- `membership` (`id`, `user_id`, `workspace_id`, `status`, `invited_by`,
  `created_at`), unique per user and workspace.
- `membership_grant` (`membership_id`, `role_id`, `geography_id`), unique per
  membership and geography.
- `department`: keyed by `workspace_id` instead of `country_code`. Add
  `archived_at`.
- `membership_department` (`membership_id`, `department_id`).
- `department_ownership` (`department_id`, `resource_kind` = `data_source` |
  `vra_indicator_group`, `resource_key`).
- `invitation`, as above, with its grants in `invitation_grant`.
- After the switch, drop `user_roles`, `user_geography_scopes`,
  `user_department` and `workspace_members`.

## Delivery order

1. **Done.** Agree this design and the open questions.
2. **Done.** Schema and backfill (migrations `035_access`, then
   `036_drop_token_access_tables` once nothing read the old copies), and
   `chart.access`:
   - `capabilities.py`: modules, levels, the default roles and departments;
   - `workspaces.ensure_workspace`: a country's workspace with its defaults;
   - `principal.py`: the access loader (cached 30 s, never for an account
     CHART has no row for; `forget(user_id)` after a change), `level_at`,
     `authorize` and `require`;
   - `signin.py`: on a fresh read, accepts pending invitations for the
     verified email, makes the seeded `chart_admin` account the first
     platform admin while there is none, and records the visit;
   - `guards.py`: `can`, `require_capability` and `require_platform_admin`
     for routes, which never compare role names.

   The backfill claimed a country's setup workspace or created
   `workspace-<cc>`, mapped each old role to the new one with a grant at each
   of the person's places (administrators got Workspace admin over their
   country and the platform-admin flag), moved departments in, and put health
   leads and officers in Health.
3. **Done.** Every route checks capabilities. `GET /auth/me` returns the
   person's grants and departments; `GET /access/check` answers one question
   (with owning departments). Where a route's place is a frame, VRA and outlook
   maps keep only the areas the person reads.
4. **Done.** `chart.workspaces` (workspaces, roles, members, invitations,
   departments, ownership) and Settings → People, Departments, Roles and
   Workspaces. The web decides what to offer with `lib/access.ts`, the same
   rule as the API.
5. **Done.** The token carries no groups; the realm's only CHART role is
   `chart_admin` for the first platform admin. `chart-admin-recover` restores
   the platform-admin flag in CHART's database.
6. **Partly done.** Department ownership narrows ERA5 pulls (`era5`) and VRA
   uploads (by indicator category). Action assignment by department comes with
   the action status work.

Each step comes with E2E coverage for allowed and denied access, isolation
between places and workspaces, and the invite lifecycle.

## Decisions

Agreed on 12 Nov 2026:

1. A member can hold **different roles in different places** (grants).
2. Members **read the places above** their grants, read only.
3. **Role capabilities are read only** in this version. Nobody edits them.
4. Departments limit writes in **actions, data uploads and VRA**.
5. Access is by **invitation only**, including for Google sign-in.
