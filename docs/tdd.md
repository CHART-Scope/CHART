# CHART — Technical Design Document

*System design & build reference*

**Climate × Health Adaptation & Resilience Tool** · Scope Impact · open-source Digital Public Good

**Stack:** React/TypeScript frontend · Python app + engine (FastAPI, one modular monolith) · Dagster (data plane) · Keycloak (identity) · PostgreSQL + PostGIS (SQLAlchemy + Alembic) · S3/MinIO · AGPL-3.0
**MVP scope:** extreme heat → low birth weight, two geographies — Madhya Pradesh (India, state), Kajiado (Kenya, county).

Standard to hold while building: *could a developer build from this?* Prose is minimal; specs, tables, and diagrams lead.

---

## Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Frontend & UI](#3-frontend-ui)
4. [Engine & repository layout](#4-engine-repository-layout)
5. [Requirements](#5-requirements)
6. [Data flows](#6-data-flows)
7. [Data model](#7-data-model)
8. [API surface](#8-api-surface)
9. [Technology & infrastructure](#9-technology-infrastructure)
10. [Cross-cutting concerns](#10-cross-cutting-concerns)
11. [Startup & self-host resilience](#11-startup-self-host-resilience)
12. [Risks & open questions](#12-risks-open-questions)
13. [Suggested build order](#13-suggested-build-order)

---

## 1. Overview

CHART is a **React/TypeScript frontend** in front of a **single Python core backend** (FastAPI, a modular monolith). The backend does double duty: an **app/API layer** (login, geography scoping, workspaces, catalog — the concerns a BFF would hold) and the **engine** (the science). They are modules in one Python codebase with enforced boundaries, sharing one Postgres via SQLAlchemy. The frontend calls the backend over HTTP and holds no business logic. A worker process runs the batch science. The standalone `chart-repository` Payload service remains an optional authoring system that publishes reviewed content through an HTTP API or public snapshot; CHART core does not import it or depend on it to boot.

> **App layer, one language.** The application layer is being consolidated into Python (FastAPI) rather than kept as a separate Node/Fastify service — there is little the app layer needs that FastAPI does not do natively (OpenAPI generation, OIDC/Keycloak, CRUD), and one backend language removes the TS↔Python contract and dual-ORM overhead. A Fastify/Drizzle app exists today and is being **retired gradually** into Python via the API seam (see §4 migration path). The **frontend stays TypeScript** (React) — the one place a JS ecosystem clearly wins.

> **No Next.js BFF.** Next route handlers may forward browser credentials to the Python API during migration, but they do not own business workflows, authorization policy, or database tables. Keycloak role + geography enforcement and all application persistence live in Python.

**The two analytical halves, kept distinct:**

- **Predictive** — "how much health harm is attributable to heat." Applies a fitted heat–health model to climate → **relative risk → attributable fraction → attributable numbers** for one outcome (LBW), with an uncertainty range. Quantitative, model-driven.
- **VRA** — "how vulnerable is this health system, how ready to cope." IPCC **AR5** proxy indicators (exposure, sensitivity, adaptive capacity) at health-systems level, per geography.

> For the MVP these are **two parallel outputs shown side by side**, not one computed from the other. Fusing them analytically is an open scientific question beyond this year.

**Structural constraints (non-negotiable):**

- **Human-review step** — a Scope SME approves every extracted/curated record before it enters the knowledge repository. No publish path bypasses approval.
- **Provenance + modeled-vs-observed label** on every record.
- **Open DHS data stored freely; restricted country data kept only as scripts + outputs, never raw.**
- **AGPL-3.0, deployable on any infrastructure** (laptop, Scope cloud, government self-host).

**Auth up front:** Keycloak issues each user a **role + geography**; the Python app layer enforces them on every request (a Kajiado officer never sees MP data). Keycloak may broker the Scope Google Workspace or a Microsoft Entra tenant, while CHART continues to trust only Keycloak-issued tokens. An upstream SSO login proves identity but does not grant a CHART role or geography. Content-authoring access is separately enforced by the repository service. One identity system, role-gated surfaces.

---

## 2. Architecture

Two flows meet in the stores: **data comes in** (sources → ingestion/ETL + review workers → stores); **users read out** (React frontend → Python app API → precomputed results). Inside the backend, **predictive and VRA are parallel** — both compute into Postgres and are shown side by side; neither feeds the other (MVP). The app/API modules and the engine modules live in one process but stay separated by enforced import boundaries.

```mermaid
flowchart TB
  subgraph users["Users"]
    officer["State Nodal Officer - India"]
    director["County Director - Kenya"]
  end
  editor["Scope content editor"]
  kc["Keycloak - identity, role + geography"]
  subgraph fe["React / TypeScript frontend"]
    pages["Pages - onboarding, planning, dashboard, hub"]
  end
  subgraph backend["Python backend - FastAPI modular monolith"]
    api["App API - login check, geography scoping, catalog, workspaces"]
    pred["predictive - heat health impact"]
    vra["vra - AR5 vulnerability"]
    sol["solution-repository adapter"]
  end
  subgraph workers["Background workers + review"]
    ingest["Ingestion + ETL"]
    proj["Projection"]
    extract["Evidence extractor - Destiny + local LLM"]
    review["SME review - approve before publish"]
  end
  subgraph stores["Stores"]
    pg[("PostgreSQL + PostGIS")]
    obj[("Object store")]
    kb[("Published solution repository")]
  end
  subgraph climate["Climate sources - by time horizon"]
    forecast["Forecast + reanalysis - ERA5 via AWS Open Data"]
    seasonal["Seasonal 1-6 months - Copernicus CDS"]
    projd["Projections to 2050 - ISIMIP then EZMIE"]
    ea["Expert Analytics - downscale to 1km"]
  end
  subgraph other["Other sources"]
    dhs["DHS health data - open"]
    gis["GIS boundaries - shapefiles"]
    byo["Bring your own data - officer-added"]
  end

  officer --> pages
  director --> pages
  pages --> api
  editor --> kb
  api --> kc
  api --> pred
  api --> vra
  api --> sol
  pred --> pg
  vra --> pg
  sol --> kb
  forecast --> ea
  seasonal --> ea
  projd --> ea
  ea --> ingest
  dhs --> ingest
  gis --> ingest
  byo --> ingest
  ingest --> pg
  ingest --> obj
  ingest --> proj
  proj --> pg
  extract --> review
  review --> kb
  kb --> api
```

### What each component does

**React/TypeScript frontend**
- **Pages** — render onboarding, planning, dashboard, hub from the component library; no business logic; call the app API over HTTP.
- **Keycloak** — identity: role + geography, login, user approval/seeding (enforced by the app layer).

**Python backend (FastAPI modular monolith)** — one codebase, two module groups behind enforced import boundaries:
- *App/API modules* — **auth** (verify Keycloak session, read role + geography, scope every request), **workspaces**, **users**, **geographies**, **hazards/catalog**, and a **solution-repository adapter** that reads reviewed public content, serving the OpenAPI contract to the frontend.
- *Engine modules* — **predictive** (applies stored fitted curve to climate → RR → attributable fraction → attributable numbers, with CIs + ensemble spread; never fits); **vra** (AR5 proxy indicators, per geography; data-driven + elicited; versions each assessment; own hazard component, separate from predictive); **ingestion**, **review**, and **shared**.

**Data plane (Dagster) + review**
- **Ingestion + ETL** — pull each source (async CDS poll or ERA5 Open Data read), land raw in object store (idempotent on hash), downscale, zonal-stats to per-district values.
- **Projection** — apply model across scenario × horizon, ensemble mean + spread, write health-impact maps.
- **Evidence extractor** — repository-side extraction → structured draft actions.
- **SME review** — repository-side approve/edit/reject; only approval publishes.

**Stores** — PostgreSQL + PostGIS (all CHART config + data + district climate + app tables; one schema owned by SQLAlchemy/Alembic); object store (raw + downscaled scratch climate and fitted-model artefacts); standalone solution repository (reviewed public content only).

**Sources** — climate three tiers (forecast ERA5/ECMWF, seasonal Copernicus, projections ISIMIP→EZMIE); Expert Analytics downscaling; DHS; GIS boundaries; bring-your-own.

---

## 3. Frontend & UI

**Frontend = React/TypeScript.** Build components in **Storybook first** (no backend, mock data), then compose into pages wired to the Python app API over HTTP. Content and analytical data both come from the app API (which serves curated content and proxies engine reads internally).

### Component inventory (from wireframes)

| Layer | Components |
|---|---|
| Primitives | `Button`, `Select`, `Pill`/`TileToggle`, `Badge`, `InfoCallout`, `VideoCard`, `StatBig` |
| Composites | `WizardStepper`, `SummaryCard`, `SelectorGrid`, `RiskMap`, `RiskLegend`, `DistrictRanking`, `PopulationGroups`, `ActionCard` |
| Layouts | `AppShell`, `WizardLayout` |
| Pages | `OnboardingWizard`, `PlanningSelector`, `Dashboard`, `LearningHub`, `Landing` |

Story hierarchy mirrors this: `primitives/ composites/ layouts/ pages/`. Components are pure functions of props; no fetch in components. Design tokens centralised in `theme/tokens.ts`, imported by app + Storybook.

### Extensibility rule — content is data, not components
- Hazard / health-domain / outcome tiles render from a catalog the app API serves, each with an `availability` flag (`available` / `coming-soon`). Adding "flooding + X" is a catalog row flip — no new component, no redeploy.
- The onboarding output (`Workspace`: country, admin level, geography, sector, collaborators) parameterises every downstream page.
- **Bring-your-own data:** an officer can register a local source through the same ingestion interface; CHART suggests which data adds most value.

> **UI/model sync:** the dashboard threshold `StatBig` must render a **geography-specific, model-derived reference percentile** (25th Kajiado, 27th MP; extreme exposure ~97th), **not** a hardcoded 35°C.

---

## 4. Engine & repository layout

**Monorepo.** Preserve the repository's existing top-level names; a mass rename adds no product value. One clone contains the React/TypeScript frontend + Python backend (app + engine) + Dagster, sharing the contract and deploying together.

```
CHART/                              # monorepo root
├─ web/                             # Next/React frontend only; no database-owning BFF
│  └─ src/lib/api-client/           # typed client GENERATED from the OpenAPI contract
│
├─ backend/                         # Python — installable package "chart" (FastAPI modular monolith)
│  ├─ chart/
│  │  ├─ api/                       #   FastAPI app: mounts the modules below as routers
│  │  ├─ auth/                      #   Keycloak/OIDC session + role/geography claim checks
│  │  ├─ workspaces/                #   workspace CRUD (onboarding output)
│  │  ├─ users/                     #   user + role management
│  │  ├─ geographies/  hazards/     #   catalog + selector data (availability flags)
│  │  ├─ solution_repository/       #   adapter for reviewed public snapshots/API
│  │  ├─ predictive/                #   erf.py (apply fitted model), service.py
│  │  ├─ vra/                       #   composite.py, service.py
│  │  ├─ ingestion/                 #   adapters/ (era5_opendata, cds, dhs, worldpop…), zonal.py
│  │  ├─ review/                    #   service.py
│  │  └─ shared/                    #   db/ (SQLAlchemy + Alembic — SOLE schema owner), provenance, config
│  └─ pyproject.toml                # + import-linter contract
│
├─ orchestration/                   # Dagster data plane — IMPORTS the chart package
│  ├─ chart_pipeline/
│  │  ├─ assets/                    #   raw_climate, downscaled, district_climate,
│  │  │                             #   covariates, fitted_model (external), health_impact
│  │  ├─ resources/                 #   db, object store, climate clients — thin, call into chart.*
│  │  └─ schedules.py  sensors.py  definitions.py
│  ├─ dagster.yaml                  # run launcher (VM vs K8s) lives HERE
│  └─ pyproject.toml                # depends on ../backend
│
├─ contracts/openapi.yaml           # backend ↔ frontend seam (generates the TS client)
├─ infra/                           # local Compose, AWS handoff, and CHART-owned K8s manifests
├─ pipelines/                       # fitted-model and focused data-processing code
├─ chart-repository/                # optional standalone Payload authoring service
├─ docs/                            # MkDocs Material site (see §10)
│  └─ api-reference.md              #   rendered from the OpenAPI contract, not hand-written
├─ mkdocs.yml                       # docs site config (Material theme, mermaid, openapi plugin)
├─ Makefile · README.md
```

### Seam rules
- **One Python core backend, two module groups.** App/API modules (`auth`, `workspaces`, `users`, `geographies`, `hazards`, solution-repository adapter) and engine modules (`predictive`, `vra`, `ingestion`, `review`) live in the same package. `chart.api` mounts them; Dagster imports the engine modules for batch. Compute lives in the modules with **no FastAPI or Dagster imports**; routers and Dagster assets are thin wrappers.
- **The OpenAPI contract** (`contracts/openapi.yaml`) is the seam between the Python backend and React: the backend implements it, `web/src/lib/api-client/` is generated from it. `make contract` keeps them in sync.
- **SQLAlchemy + Alembic is the sole schema owner** — every table (app and engine) is defined and migrated in `chart/shared/db`. No second ORM owns or migrates the schema.
- **Repository content stays across an HTTP/snapshot seam.** `chart-repository/` owns its Payload schema, media, review workflow, and repository auth. Python reads only its published API/snapshot; CHART core remains bootable when the repository is unavailable.

### Module dependency rule (import-linter, in CI)
```ini
[importlinter:contract:layers]
type = layers
layers =
    chart.api
    chart.predictive | chart.vra | chart.solutions | chart.review
    chart.ingestion
    chart.shared

[importlinter:contract:module-privacy]
type = forbidden
source_modules = chart.vra
forbidden_modules = chart.predictive.erf   # import service.py, never internals
```

### Runtime faces
- **Serving:** the FastAPI app (`chart.api`) serves the frontend's synchronous reads and writes.
- **Batch:** Dagster (`dagster-daemon` schedules, run launcher executes), calling engine functions. Replaces any job queue for the data plane.
- Default: **one backend image used two ways** (run as the API; imported by Dagster) → versions lockstep.

### Migration path (retiring Fastify into Python, strangler-style)
A Fastify/Drizzle app layer exists today. It is being replaced module-by-module by the Python app modules above, using the OpenAPI contract as the stable seam so the frontend never notices which language serves a given endpoint:
1. Stand up the Python `chart.api` alongside Fastify, both behind the same contract.
2. Auth moved first by product decision so new Python routes can enforce the final policy from their first release. Continue with `geographies`, `hazards` (read-mostly) → `workspaces`, `users` → analytical reads and repository adapters.
3. For each: implement in Python, point the frontend's generated client at the Python endpoint, delete the Fastify module.
4. Delete Fastify + Drizzle only after route, data, authorization, and frontend parity tests pass for every migrated module. Temporary breakage and deletion without a parity gate are rejected.
> Do the moves **between deliverables, not mid-feature**, and finish — a half-migrated state that keeps both stacks alive indefinitely is the failure mode to avoid.

### Model fitting → platform handoff
Fitting is **offline R work by the modeler**, one model per geography. The platform never fits. The modeler publishes the **fitted curve** (shape, lag window, reference percentile, projection source, R-code `git_ref`) into `erf_parameters` (one row per geography × outcome); Dagster tracks it as an **external asset**. `predictive/erf.py` *applies* the curve. Open DHS code + data can live in the repo as the reference implementation.

### Local development & getting started
Goal: **clone → one command → a working app with data in it.** Everything runs in containers locally (MinIO for S3, a Postgres/PostGIS container).

```bash
# first run and migrations
make install
make services
make migrate

# everyday
make web             # React dev server
make climate-api     # FastAPI app API + current engine routes
make dagster-dev     # Dagster UI + daemon in development
make docs-serve      # MkDocs
make verify
```

The Makefile remains the command surface; introducing a second task runner is unnecessary. The target local stack is Postgres+PostGIS, MinIO, Keycloak, Python, React, and Dagster. Preflight validates config and migrations before serving.

**Tooling:** `uv` (Python), `npm`/`pnpm` (frontend); `ruff` + `mypy` + `pytest` + import-linter in CI; Storybook for backend-free frontend work. Local mirrors prod: same images under Compose here, k3s/EKS there, or `k3d` locally to exercise Kubernetes. Self-hoster runs the same three commands — only `.env` differs.

---

## 5. Requirements

### Predictive modeling

| Ref | Requirement |
|---|---|
| Models | **Two separate distributed-lag models, one per geography** (Kajiado, MP) — not combined. `erf_parameters` is per-geography × per-outcome. |
| Method | Distributed-lag model capturing delayed + nonlinear effects; splines; lag window configurable per disease; **9-month lag by trimester** for LBW. |
| Threshold | Reference = **percentile of local temperature** (25th Kajiado, 27th MP); extreme exposure shown ~97th percentile. **Fixed 35°C rejected.** |
| Outputs | Exposure-response function → **relative risk → attributable fraction → attributable numbers** (case counts). Supports policy counterfactual ("cut temp 5° → LBW prevented?"). |
| Covariates | Temperature + rainfall + **air pollution** (remote sensing) + **population** (WorldPop, incl. projections). |
| Reusability | One methodology across outcomes/geographies via input swaps. New regions without local health data: estimate from national DHS or literature. **Health data is the bottleneck; climate is always available.** |
| Projection source | **ISIMIP now → EZMIE** (bias-corrected, preferred). Adapter treats dataset as swappable. Projections static once extracted. |
| Ingest | ERA5 daily granularity (monthly insufficient). Bounding boxes: whole Kenya + whole MP; extract smaller. |
| Uncertainty | Climate ensemble (5 now, up to 20–30), **equal-weighted**: mean thick line + spread. RR and attributable numbers carry CIs. No live re-fitting. |
| Display | Health impact, not raw temperature. RR + attributable fraction (primary) + attributable numbers. District map + time trends. |
| Resolution | ~50 km native; Expert Analytics downscales to 1 km / 500 m into PostGIS. Kajiado sparse — projection downscaling is an open dependency. |

### VRA
- **Functional:** assess vulnerability with **IPCC AR5** proxy indicators (exposure, sensitivity, adaptive capacity), health-systems level; mix data-driven + elicited/literature indicators; normalise, optionally compose a score; flag maladaptation; version each assessment.
- **Non-functional:** small comparable core across India + Kenya + country-specific indicators (local trust); indicators are config, not code (per-geography sets); prefer proxies over sensitive health data; **presented alongside predictive, not fed by it (MVP)**.

### Solutions repository
- Search/filter reviewed solutions by hazard, outcome, sector, WHO-GAP category.
- Extract unstructured plans/papers into structured drafts (local LLM).
- SME approves/edits/rejects each draft before publish or serve. **No unreviewed record is ever served.**

### UX / workspace
- Onboard: country → admin area → sector → workspace.
- Plan: hazard → health domain → outcome (availability-gated tiles).
- Navigate: regional map → district ranking → district detail → actions.
- Role + geography scoping server-side; modeled vs observed visually distinct; content extensible by config.

### Pipeline + human review
- Ingest climate/health/GIS/literature on schedule and on demand.
- Route every candidate record through review before publish.
- Idempotent on source hash; per-source isolation. Open data stored freely; restricted data as scripts/outputs only.

### Documentation
- **Functional:** publish one docs site (MkDocs + Material) covering system design (contributors) and deployment/operation (self-hosting governments); ship an **operator deployment guide** with a runnable path per target — local (a single all-in-one demo image *and* `docker compose up` with bring-your-own-database), AWS (reference), other clouds (Azure/GCP), Kubernetes at scale; API reference **generated from the OpenAPI contract**, never hand-written.
- **Non-functional:** CI fails if the contract, generated client, or docs site drift from code; deploy docs reference the actual `infra/` and platform-repository artifacts and CI smoke-tests local Compose health so they cannot drift; internal-API interactive docs (Swagger/ReDoc) are cluster-internal only; docs are versioned per release and built in CI like the app.

---

## 6. Data flows

Each flow lists the entities it touches: **C**reate · **R**ead · **U**pdate · **A**sset/store · **×** not persisted.

### 6.1 Model fitting (offline, in R, by the modeler)
Not part of the running app. CHART receives and stores the fitted curve; never fits.
```mermaid
sequenceDiagram
  autonumber
  participant MOD as Modeler (R, offline)
  participant DHS as DHS data (open)
  participant CHART as CHART model store
  MOD->>DHS: Load records, build the analytical dataset
  MOD->>MOD: Add climate and covariates, fit the heat-health model
  Note over MOD: One model per geography. Reference is a percentile of local temperature — 25th Kajiado, 27th MP
  MOD->>MOD: Validate the fitted curve once
  MOD->>CHART: Publish the fitted curve for this geography and outcome
  Note over MOD,CHART: CHART stores the curve and never re-fits. Fitting stays in R, outside the app
```
Entities: **C** `ERF_PARAMETERS` · **×** fitting happens in R, not in CHART's stores.

### 6.2 Climate ingestion & zonal aggregation (batch)
Two adapter shapes behind one interface. **ERA5 via AWS Open Data** = direct partial read from S3 (Zarr, no ticket/poll, free egress in-region, raw already durable so no re-landing). **Seasonal & projections via CDS** = async submit→poll→download→land raw (why *that* path never sits on a user request). Both converge at zonal stats.
```mermaid
sequenceDiagram
  autonumber
  participant SCH as Scheduler
  participant ING as Ingestion Worker
  participant OD as AWS Open Data - ERA5 S3
  participant CDS as Copernicus CDS - seasonal, projections
  participant EA as Expert Analytics
  participant OBJ as Object Store
  participant PG as PostGIS
  SCH->>ING: Trigger climate pull for a source and region
  alt ERA5 via AWS Open Data
    ING->>OD: Read subset directly, bounding box and variables
    Note over ING,OD: Zarr partial read, no ticket, no polling, free egress in-region
    OD-->>ING: Climate subset (raw already durable, no re-landing)
  else Seasonal or projections via CDS
    ING->>CDS: Submit subset request
    Note over ING,CDS: CDS is async, queued not immediate
    CDS-->>ING: Request id, status queued
    ING->>CDS: Poll until ready, with backoff
    CDS-->>ING: Download link for raster
    ING->>OBJ: Store raw raster keyed by hash
  end
  ING->>EA: Request downscale to 1km
  EA-->>ING: Downscaled grid
  ING->>PG: Run zonal stats over admin boundaries
  Note over ING,PG: Aggregate grid cells per district polygon
  ING->>PG: Upsert district climate, label reanalysis or sample
```
Entities: **R** `ADMIN_UNIT` · **CU** `CLIMATE_RUN`, `DISTRICT_CLIMATE` · **A** raw raster → object store (CDS path only; Open Data is read-through).
**Caveats:** verify the Open Data ERA5 matches the modeler's source (variables, resolution, version — diff a slice); run ingestion compute in the bucket's region to keep egress free; self-hosters reading Open Data from their own hardware pay normal internet egress.

### 6.3 Health-impact projection (batch)
```mermaid
sequenceDiagram
  autonumber
  participant SCH as Scheduler
  participant PRJ as Projection Worker
  participant PG as PostgreSQL
  participant API as Internal API
  SCH->>PRJ: Run projection for geography, scenario, horizon
  PRJ->>PG: Read the fitted curve, climate, and covariates (population, pollution)
  PRJ->>PRJ: Apply curve to get relative risk at the exposure
  PRJ->>PRJ: Convert to attributable fraction, then attributable numbers
  PRJ->>PRJ: Combine across climate models for mean and spread
  PRJ->>PG: Write health-impact map with confidence intervals
  Note over PRJ,PG: No re-fitting. Uncertainty is the ensemble spread plus model CIs
  API->>PG: Read health-impact map by scenario and horizon
```
Entities: **R** `ERF_PARAMETERS`, `CLIMATE_RUN`/`DISTRICT_CLIMATE`, `COVARIATE` · **C** `HEALTH_IMPACT`, `PROVENANCE`.
No fallback: a geography either has a fitted curve or shows "not available yet".

### 6.4 VRA assessment (parallel to predictive)
```mermaid
sequenceDiagram
  autonumber
  participant U as State or County User
  participant VRA as VRA Module
  participant PG as PostgreSQL
  participant SOL as Solutions Module
  U->>VRA: Start assessment for admin unit
  VRA->>PG: Load AR5 indicator definitions, weights, framework version
  VRA->>PG: Read data-driven indicator values incl own hazard component
  Note over VRA,PG: Dataset-derived values come from the ETL not the user
  U->>VRA: Enter elicited indicators only (governance, capacity)
  VRA->>VRA: Normalise indicators, optionally compose a score
  U->>VRA: Select candidate actions
  VRA->>SOL: Check actions for maladaptation flags
  SOL-->>VRA: Flag list with rationale
  VRA->>PG: Save assessment version referencing values and weights
  Note over VRA,PG: Re-running creates a new version, prior stay comparable
```
Entities: **R** `INDICATOR_DEFINITION`, `INDICATOR_WEIGHT`, `INDICATOR_VALUE`, `SOLUTION` · **C** `VRA_ASSESSMENT`, elicited `INDICATOR_VALUE`.

### 6.5 Solutions ingestion through the human-review step
```mermaid
sequenceDiagram
  autonumber
  participant SRC as Airtable / Destiny
  participant EXT as Document Extractor
  participant REV as Review Module
  participant SME as Scope SME
  participant KB as Knowledge Repository
  participant GH as Provenance
  SRC->>EXT: New action plan or paper (background)
  EXT->>EXT: Extract to structured draft against schema
  EXT->>REV: Create draft in pending_review state
  Note over EXT,REV: Draft is never publicly visible
  SME->>REV: Inspect draft and source
  alt Approved
    SME->>REV: Approve with edits
    REV->>KB: Publish solution as reviewed
    REV->>GH: Commit provenance and reviewer identity
  else Rejected
    SME->>REV: Reject with reason
    REV->>REV: Keep out of repository
  end
```
Entities: **C** `SOLUTION` (draft), `REVIEW_EVENT`, `PROVENANCE` · **U** `SOLUTION.status`.

### 6.6 User request (read-only, per click)
```mermaid
sequenceDiagram
  autonumber
  participant U as State or County User
  participant FE as React frontend
  participant API as Python app API
  participant KC as Keycloak
  participant ENG as Engine modules
  participant PG as PostgreSQL
  U->>FE: Open dashboard for workspace
  FE->>API: Request health-impact map, scenario and horizon
  API->>KC: Verify session, read role and geography
  API->>ENG: Read precomputed map for admin unit in scope
  ENG->>PG: Select map labelled modeled
  PG-->>ENG: Attributable-fraction map
  ENG-->>API: Map payload
  API-->>FE: Map plus district ranking
  Note over API,PG: Served from precomputed data, no external pull
  U->>FE: Open a district and view actions
  FE->>API: Request district detail and linked actions
  API->>ENG: Read relative risk, attributable fraction, attributable numbers
  ENG-->>API: District detail plus reviewed actions
```
Entities: **R** `WORKSPACE`, `HEALTH_IMPACT`, `ADMIN_UNIT`, `SOLUTION` · **×** no writes.

### 6.7 Explicit on-demand prediction
Dashboard reads remain precomputed as in §6.6. An explicit user prediction is different: it may enqueue missing climate preparation and model application, but the HTTP request never waits for that work.

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant FE as React frontend
  participant API as Python API
  participant PG as PostgreSQL
  participant DG as Dagster sensor + job
  participant MOD as Deterministic R model
  U->>FE: Request prediction
  FE->>API: POST prediction with Keycloak token
  API->>API: Enforce role + geography
  API->>PG: Get/create by idempotency key
  API-->>FE: 202 + request id + status URL
  DG->>PG: Claim queued request
  alt climate missing
    DG->>DG: Pull only the missing climate partition
    DG->>PG: Persist climate run
  end
  DG->>MOD: Apply fitted model
  MOD-->>DG: Statistical result + uncertainty
  DG->>PG: Persist deterministic result
  FE->>API: Poll status URL
  API->>API: Enforce role + geography again
  API-->>FE: stage + deterministic result
```

- PostgreSQL is the durable request/state store; Dagster is the executor. Redis or another queue is not required for this workflow.
- Duplicate requests coalesce on the versioned request key; an in-flight duplicate returns the same request and status URL.
- Optional plain-language explanation inference, including model choice, safety validation, and hardware sizing, is deferred to a dedicated design and deployment change. It must never alter or block the deterministic result.

---

## 7. Data model

Anchored on `admin_unit` (geographic spine) and `provenance` (every ingested artefact). **Config** (`indicator_definition`, `indicator_weight`, `erf_parameters`) is separate from **data** (`indicator_value`, `health_impact`, `covariate`, `district_climate`). Raw microdata is absent by design. Published solution/content records remain owned by the standalone repository and cross into CHART through the adapter; they are not a second CHART ORM schema.

```mermaid
erDiagram
  GEOGRAPHY ||--o{ ADMIN_UNIT : contains
  GEOGRAPHY ||--o{ ERF_PARAMETERS : fits
  ADMIN_UNIT ||--o{ HEALTH_IMPACT : scored_by
  ADMIN_UNIT ||--o{ DISTRICT_CLIMATE : aggregated_to
  ADMIN_UNIT ||--o{ COVARIATE : has
  ADMIN_UNIT ||--o{ VRA_ASSESSMENT : assessed_by
  ADMIN_UNIT ||--o{ INDICATOR_VALUE : measured_at
  DATA_SOURCE ||--o{ CLIMATE_RUN : produces
  CLIMATE_RUN ||--o{ DISTRICT_CLIMATE : yields
  DISTRICT_CLIMATE ||--o{ HEALTH_IMPACT : feeds
  ERF_PARAMETERS ||--o{ HEALTH_IMPACT : applies
  COVARIATE ||--o{ HEALTH_IMPACT : adjusts
  HEALTH_IMPACT }o--|| PROVENANCE : tracked_by
  INDICATOR_DEFINITION ||--o{ INDICATOR_VALUE : defines
  INDICATOR_VALUE }o--|| PROVENANCE : tracked_by
  VRA_ASSESSMENT ||--o{ INDICATOR_VALUE : snapshots
  INDICATOR_WEIGHT }o--|| VRA_ASSESSMENT : weights
  WORKSPACE }o--|| USER : owned_by
  WORKSPACE }o--|| ADMIN_UNIT : scoped_to
  USER }o--|| ROLE : holds
```

> The diagram above renders on GitHub or any Mermaid-aware viewer. In a plain markdown preview it shows as code — the same relationships are tabulated below so nothing is lost.

### Relationships

| Parent | Cardinality | Child | Meaning |
|---|---|---|---|
| `geography` | 1 → many | `admin_unit` | a geography contains many admin units |
| `geography` | 1 → many | `erf_parameters` | one fitted model per geography × outcome |
| `data_source` | 1 → many | `climate_run` | a source produces many climate runs |
| `climate_run` | 1 → many | `district_climate` | a run yields per-district aggregates |
| `admin_unit` | 1 → many | `district_climate` | each district has aggregated climate values |
| `admin_unit` | 1 → many | `covariate` | population, pollution per district |
| `admin_unit` | 1 → many | `health_impact` | scored per scenario × horizon |
| `admin_unit` | 1 → many | `indicator_value` | VRA indicator values per district |
| `admin_unit` | 1 → many | `vra_assessment` | assessments per district (versioned) |
| `district_climate` | many → 1 | `health_impact` | climate feeds the projection |
| `erf_parameters` | 1 → many | `health_impact` | the fitted curve is applied |
| `covariate` | many → 1 | `health_impact` | covariates adjust the projection |
| `indicator_definition` | 1 → many | `indicator_value` | defines what each value measures |
| `indicator_weight` | many → 1 | `vra_assessment` | weights applied in an assessment |
| `vra_assessment` | 1 → many | `indicator_value` | snapshots the values it used |
| `health_impact` | many → 1 | `provenance` | source + climate run tracked |
| `indicator_value` | many → 1 | `provenance` | source tracked |
| `workspace` | many → 1 | `user` | owned by a user |
| `workspace` | many → 1 | `admin_unit` | scoped to a geography |
| `user` | many → 1 | `role` | holds a role (+ geography claim) |

### Key entities & fields

| Entity | Fields (types) | Notes |
|---|---|---|
| `data_source` | id, name, kind, cadence, geography_id, user_added(bool), last_refreshed_at | Registry of built-in + user-added sources. `cadence`+`last_refreshed_at` drive refresh; `user_added` = BYO hook. |
| `prediction_request` | id, request_key, geography, timeframe, request_payload, status, stage, dagster_run_id, climate_run_id, result_payload, error_code | Durable API-to-Dagster handoff. `request_key` coalesces duplicate user requests; completed R results remain queryable. |
| `geography` | id, country, name | Kajiado, MP. |
| `admin_unit` | id, geography_id, level, code, boundary `geometry(MultiPolygon,4326)` | Spatial spine; spatial index for zonal stats. |
| `climate_run` | id, data_source_id, tier, input_hash(SHA-256), scenario, resolution, data_label | `input_hash` = idempotency + reproducibility. |
| `district_climate` | id, admin_unit_id, climate_run_id, variable, value, agg_method | Zonal-stats output; read by predictive + VRA. `agg_method` = area-weighted mean vs centroid (**open**). |
| `erf_parameters` | id, geography_id, outcome, spline_coefficients(jsonb), lag_window(jsonb), ref_percentile, projection_source, git_ref | One row per geography × outcome; reference is a percentile. |
| `health_impact` | id, admin_unit_id, scenario, horizon, relative_risk_milli, rr_ci_low_milli, rr_ci_high_milli, attributable_frac_milli, attributable_number, ensemble_spread_milli, data_label | Grain: (admin_unit, scenario, horizon). Integers ×1000 (milli), no floats on public-facing numbers. `attributable_number` = case count. |
| `covariate` | id, admin_unit_id, kind, value, data_label | pollution, population. |
| `indicator_definition` | id, code, domain, source_dataset, direction, normalise_method | AR5 indicators, config not code, per-geography sets. |
| `indicator_value` | id, admin_unit_id, indicator_code, value, normalised_milli, data_label | Data-driven + elicited. |
| `indicator_weight` | id, domain, weight_milli, framework_version | Per-domain or per-indicator (**open**). |
| `vra_assessment` | id, admin_unit_id, framework_version, version, composite_milli | Versioned; re-run creates new version. |
| `workspace` | id, country, admin_level, sectors(jsonb) | Onboarding output; parameterises pages. |
| `user` | id, keycloak_sub | Identity via Keycloak. |
| `role` | id, name | e.g. State Nodal Officer, County Director. |
| `provenance` | id, source_uri, git_commit, license | On every ingested artefact. |

`data_label` enum: `modeled` / `observed` / `reanalysis` / `sample`.

---

## 8. API surface

One Python backend, two route groups. **App API** — public, Keycloak-scoped routes the React frontend calls (auth, workspaces, catalog, repository-backed content, analytical reads). **Engine calls** — the app modules call the engine modules **in-process** (same monolith, not over a network); the routes below marked *engine/admin* are private, admin-only, and not exposed to the public. The OpenAPI contract generates the frontend's typed client.

### App API — auth & workspace
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/me` | Current user, role, geography claims. |
| GET | `/api/geographies` · `/api/geographies/:country/admin-levels` | Onboarding options. |
| POST | `/api/workspaces` | Persist onboarding result. |
| PATCH | `/api/workspaces/:id` | Edit workspace. |

### App API — catalog & content
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/catalog/hazards` · `/health-domains` · `/outcomes` | Selector tiles with `availability` flags. |
| GET | `/api/content/learning-hub` · `/api/content/pages/:slug` | Reviewed repository content through the Python adapter. |

### App API — analytical reads (served by the engine modules in-process)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/risk/:geo/map?outcome=&scenario=&horizon=` | Health-impact choropleth (attributable fraction by district). |
| GET | `/api/risk/:geo/districts?outcome=&scenario=&horizon=` | District ranking + time trend. |
| GET | `/api/districts/:id?outcome=&scenario=&horizon=` | RR, attributable fraction, attributable numbers, each with CIs. |
| GET | `/api/solutions?hazard=&outcome=&sector=` | Reviewed actions only. |
| POST | `/api/vra/:adminUnit/assessments` | Create a VRA assessment version. |

### App API — on-demand prediction
| Method | Path | Purpose |
|---|---|---|
| POST | `/climate/predict` | Get/create one idempotent prediction request; returns a result immediately when already complete, otherwise `202`. |
| GET | `/climate/prediction-requests/:id` | Poll stage, Dagster run id, and deterministic result; always geography-scoped. |

### Engine / admin routes (private, not public)
| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/models` | Publish a fitted curve for a geography + outcome (modeler handoff). CHART never fits. |
| GET | `/internal/admin-units/:id/health-impact?outcome=&scenario=&horizon=` | Precomputed projection (RR, attr. fraction, attr. numbers, CIs). |
| GET | `/internal/admin-units/:id/vra` | Precomputed VRA result (normalised AR5 indicators + composite if used). |
| POST | `/internal/ingestion-runs` · `/internal/projection-runs` | Trigger batch jobs (idempotent on hash); admin only. |
| POST | `/internal/review/drafts/:id/decision` | The only path that publishes a solution. |

> **API docs are generated, never written.** Source of truth is `contracts/openapi.yaml`. FastAPI serves Swagger/ReDoc for internal devs (cluster-internal only, never public). The published reference in the docs site (§10) renders from the same contract. CI fails on any drift between the backend, the contract, and the generated frontend client.

---

## 9. Technology & infrastructure

| Layer | Choice | Why |
|---|---|---|
| Frontend | React / TypeScript (Storybook) | UI only; calls the Python API over HTTP; shared types via the generated client. |
| Component workshop | Storybook + MapLibre GL | Isolated components; open self-hostable map tiles. |
| Backend (app + engine) | Python FastAPI, one modular monolith (SQLAlchemy 2.0) | App/API layer + engine as modules in one process; import-linter seams; one language removes the TS↔Python contract + dual-ORM overhead. |
| Content + curation | Optional standalone Payload repository | Owns authoring, media, review, and repository auth; publishes reviewed API/snapshots that Python adapts. |
| Auth | Keycloak (OIDC) | Role + geography claims, enforced by the app layer on every request; editors are role-gated. |
| Engine | Modules within the backend | predictive/VRA/ingestion; import-linter seams for a later split. |
| Datastore | PostgreSQL + PostGIS (SQLAlchemy 2.0, Alembic) | Relational + spatial + JSONB in one; zonal stats in PostGIS. |
| Object store | S3-compatible (MinIO self-host) | Swappable raster/tile landing. |
| Data plane / jobs | Dagster — assets, partitions, schedules, freshness | Partitioned (geo × scenario × horizon) with lineage + backfills. Compute stays in engine. |
| Climate ingest | Copernicus CDS async client; Expert Analytics downscale | CDS is submit→poll→download; a Dagster asset, never on a request. |
| Tooling | uv, ruff, mypy, pytest; pydantic-settings | Fast, typed; config from env, no secrets in code. |
| Deploy | Containers: Compose on VPS → k3s → EKS | Same images across tiers. |
| License | AGPL-3.0 | Network-copyleft keeps hosted forks open. |

### Deployment topology (Scope-hosted reference: k3s on one EC2)
Principle: **swappable storage (S3 + Postgres); compute is the only real choice.**

```mermaid
flowchart TB
  user["Users - officers and editors"]
  subgraph aws["AWS account - swappable cloud, or self-hosted"]
    r53["Route 53 - DNS + domain"]
    alb["Load balancer - TLS via ACM, rate limit"]
    s3[("S3 - object store + AWS Open Data climate")]
    ssm["Parameter Store + Secrets Manager"]
    subgraph vpc["VPC"]
      subgraph pub["Public subnet - EC2 running k3s (single node)"]
        ingress["k3s ingress - routing + egress allowlist"]
        web["React frontend"]
        eng["Python backend + engine - FastAPI"]
        dag["Dagster - daemon + webserver"]
        kc["Keycloak"]
        eso["External Secrets Operator"]
      end
      subgraph priv["Private subnet - no internet"]
        rds[("RDS - PostgreSQL + PostGIS")]
      end
    end
  end
  user --> r53
  r53 --> alb
  alb --> ingress
  ingress --> web
  ingress --> kc
  web --> eng
  eng --> rds
  dag --> rds
  dag --> s3
  eng --> s3
  ssm --> eso
  eso --> web
```

- Single-node k3s compute in a **public subnet** behind the ALB (TLS via free auto-rotating ACM cert, rate-limit), matching the current reusable module. Only the load balancer exposes application routes; administration uses SSM rather than SSH. RDS remains in **private subnets**, reachable only through its security group and never internet-exposed.
- **k3s now, EKS later:** EKS bills ~€45/mo control plane + per-GB NAT gateway — enterprise tax for scale the MVP lacks. k3s on one EC2 gives orchestration, GitOps, TLS rotation, and **per-namespace egress allowlist** (a compromised container can't exfiltrate secrets) cheaply. Switch to EKS when >2 instances or a paying customer needs managed hosting.
- **AWS Open Data:** ERA5/Copernicus is free to download there — but (1) verify same variables/resolution/version by diffing a slice; (2) it's a per-source fast path, ISIMIP/IMD still need their own adapters.

### Scope infrastructure reuse decision

CHART reuses the proven platform pattern in the existing `halla-health-infra` repository instead of maintaining a second hand-written EC2 deployment. Reuse is at the **provisioning boundary**, not by sharing Halla's live application runtime:

| Owner | Responsibility |
|---|---|
| Scope infrastructure repository | OpenTofu/Terragrunt modules, VPC, ALB, Route 53, EC2/k3s, RDS, S3, IAM, SSM/Secrets Manager, cluster bootstrap, Flux, cert-manager, External Secrets. |
| CHART repository | Container images, migrations, OpenAPI contract, CHART Kubernetes base/overlays or Helm values, resource requests, health checks, Dagster definitions, and end-to-end smoke tests. |

Before CHART consumes the Halla modules, parameterise the remaining Halla-specific values: project/tag prefix, permissions-boundary name, SSM/secret path, DNS names, Flux owner/repository/path, CPU architecture/AMI, instance type, and data-volume size. Do not copy Halla application manifests or point CHART at Halla production databases. Sandbox may reuse the existing AWS account/bootstrap roles, but CHART gets separate state paths, names, RDS database, S3 buckets, namespace, and compute lifecycle.

The first CHART hosted stack is a **separate single-node k3s deployment** built from those generic modules. This avoids coupling Halla availability or upgrades to CHART while retaining the tested security and recovery model.

### Deployment tiers (same containers)
| Tier | Orchestration | When |
|---|---|---|
| Local dev | Docker Compose or k3d | development, evaluation |
| Scope-hosted MVP | k3s on single EC2 | now — tens of users |
| Managed / scale | EKS, multi-node | >2 instances or paying customer |
| Government self-host | their own VM or cluster | data sovereignty |

### Two ways to get it running
CHART is several containers (app, engine, Dagster, Keycloak) + Postgres + object store, so two documented entry points:
- **Single all-in-one image (try / evaluate):** one image bundling every service — `docker run` and click around in minutes, no Compose, no cloud. *Evaluation only* — no independent scaling, data ephemeral unless a volume is mounted; a deliberate extra build under `infra/` is kept only if the five-minute eval path is actively maintained and smoke-tested.
- **`docker compose up` with prebuilt images (real local / small self-host):** the honest multi-container shape, each service its own container, published to the registry. Bring your own Postgres/object store via `.env` or use the bundled ones. Same Compose file the dev workflow uses.

> **Deploy artifacts are the docs' source of truth.** CHART's `infra/` holds local Compose and CHART-owned Kubernetes workload definitions; the shared infrastructure repository holds tested AWS/OpenTofu modules and cluster bootstrap. CI validates both sides of that contract and smoke-tests that deployed health and one prediction flow work.

### Delivery: GitOps pull model + secrets
```mermaid
flowchart LR
  dev["Developer"]
  gh["GitHub - code + config"]
  ci["GitHub Actions - build image"]
  ghcr["GitHub Container Registry"]
  subgraph cluster["k3s cluster"]
    flux["Flux - polls for changes"]
    app["App containers"]
    eso["External Secrets Operator"]
  end
  ssm["Parameter Store + Secrets Manager"]
  dev --> gh
  gh --> ci
  ci --> ghcr
  ci -->|update image tag| gh
  flux -->|pull| gh
  flux -->|pull| ghcr
  flux --> app
  ssm --> eso
  eso --> app
```
**Pull, not push:** CHART CI builds → pushes immutable images to GHCR → updates a reviewed CHART manifest/tag. Flux inside the cluster pulls the desired state. GitHub never receives inbound cluster credentials. Sandbox and production are separate state/config paths with a promote step. Secrets: Parameter Store (manual static values) + Secrets Manager (AWS-managed/rotating values), synced by External Secrets Operator. No secret value is stored in Git, even encrypted.

---

## 10. Cross-cutting concerns

- **Security:** Keycloak role + geography claims enforced by the app layer on every route; engine module queries geography-scoped. Open DHS stored freely; restricted data as scripts/outputs only. TLS in transit, encryption at rest, secrets from env. Engine/admin routes private. k3s per-namespace egress allowlist.
- **Scalability:** small (two geographies, monthly-ish cadence, precomputed reads). The backend scales as a web tier; the engine's heavy batch (zonal stats, projection) scales by adding worker instances. No sharding, no broker.
- **Cost:** floor is one node + RDS/S3; self-hostable. Choose compute size from measured Python, Dagster, Keycloak, and R-model usage. Variable cost at the edge (CDS/EA egress) is rate-limited. AWS Open Data softens climate egress.
- **Observability:** correlation id per ingest/score/projection/review; per-source job success/failure; audit trail of review decisions. Headline signal: **last successful run per source**.
- **Resilience:** CDS async submit→poll→download, backoff; persistent failure keeps last-good map and shows "not available yet" (no fabricated proxy). Idempotent on `input_hash`, per-source isolation. Extractor produces drafts only. The frontend serves last-good cached reads on a brief backend blip; writes fail closed.

### Data plane & orchestration (Dagster)
```mermaid
flowchart LR
  raw["raw_climate - geo x tier x period"]
  down["downscaled_climate - 1km via Expert Analytics"]
  bound["admin_boundaries - GIS shapefiles"]
  cov["covariates - pollution, WorldPop"]
  dist["district_climate - zonal stats"]
  fit["fitted_model - EXTERNAL, modeler in R"]
  hi["health_impact - geo x scenario x horizon"]
  raw --> down
  down --> dist
  bound --> dist
  dist --> hi
  cov --> hi
  fit --> hi
```
- `health_impact` is a **multi-dimensional partitioned asset** (geo × scenario × horizon) — new climate re-materializes only affected partitions. Lineage = provenance, free.
- `fitted_model` is an **external asset** (produced in R); publishing a new one marks downstream `health_impact` stale.
- **Refresh modes:** projections static (materialize once); climate monthly (schedule / freshness policy); on-demand prediction (app writes a durable Postgres request, a Dagster sensor launches one idempotent job, and the job pulls only missing climate data).
- **Same scheduler, different job shape by source:** only the `raw_climate` adapter differs — ERA5 is a bounded direct read from AWS Open Data (no waiting state), seasonal/projections use the async CDS poll. One-adapter swap, not a pipeline change; asset graph, partitions, freshness identical.

> **Why keep an orchestrator (decided):** the pipeline has real DAG structure (pull → downscale → zonal → project, partitioned by geography × scenario × horizon, fitted model as external input), so backfills and freshness tracking come free rather than hand-built. Cost is two long-lived services (webserver + daemon) to run/secure — accepted; that batch work is what an orchestrator is for. Revisit only if the pipeline shrinks to a single trivial step. Compute stays in the engine, so this is a wrapper choice, not lock-in.
- **VM vs K8s = run launcher only** (`dagster.yaml`): VM = local/multiprocess; K8s = `K8sRunLauncher` + `k8s_job_executor` (per-run/step pods). Same asset code. k3s is a K8s flavour, so on a single node stay on the simple launcher; per-run pods at EKS.

### Documentation & API reference (MkDocs Material, generated, CI-guarded)
For a DPG the docs are part of the product — governments read them before running anything — so they're built and tested like code. One site, two audiences: contributor/system-design docs (this doc) + operator/self-host docs. Tool: **MkDocs + Material** (Python, markdown-native, Mermaid, search, per-release versioning).

**Generated, never hand-written:** the API reference is produced from `contracts/openapi.yaml`. FastAPI serves Swagger/ReDoc for internal devs (cluster-internal only); the published reference renders from the same contract. The contract is the single source of truth for the backend, the generated frontend client, and the docs.

**CI checks on every PR:**

| CI check | Guarantees |
|---|---|
| Validate the OpenAPI contract (spec lint) | contract is well-formed |
| Generate OpenAPI from the FastAPI app, diff vs committed contract | engine implements what the contract promises — fail on drift |
| Regenerate the typed frontend client from the contract, assert no diff | frontend client never stale against the API |
| Build MkDocs with `--strict` | no broken nav, missing pages, dead internal links |
| Link-check external references | operator/deploy docs don't rot |

On merge to `main`, CI publishes the site (Read the Docs or static behind the load balancer) — same GitOps discipline as the app. Net: a change not reflected in the contract + docs **fails the build**, so the reference cannot drift. Build work: `mkdocs.yml` + `docs/` tree (§4), an OpenAPI-render plugin, a `make docs-build` target, and the CI job above.

### Operator & deployment guide (what the docs must cover)
"How do I run this?" asked at four levels. The docs carry a runnable, tested path for each — local + AWS as MVP musts, the portability rungs documented-as-supported and built when a real deployer needs them (adopt-when-demanded, as with EKS).

| Rung | What the deployer does | Artifact | Priority |
|---|---|---|---|
| Try / evaluate | Pull the single all-in-one image, `docker run`, click around in minutes | combined `infra/` image if maintained | **MVP should** |
| Local / small self-host | `docker compose up` with prebuilt images; connect own Postgres/object store via `.env` | `infra/docker-compose.yml` | **MVP must** |
| AWS (reference) | k3s on EC2 + RDS + S3 + GitOps, step by step (§9 topology) | shared OpenTofu modules + CHART `infra/k8s/` workloads | **MVP must** |
| Other cloud (Azure, GCP) | Same contract — a Postgres, an S3-compatible bucket, a container host; AWS is the worked example, this documents the mapping | portability notes + Helm | documented; built when needed |
| Kubernetes at scale | Helm into a real cluster; Dagster K8s run launcher (per-run pods); scale engine workers for many geographies | `k8s/` Helm + values | documented; built when needed |

This ladder is what the swappable-storage contract and "same containers everywhere" were *for*: nothing in the app is AWS-specific, only the wrapper changes. All-in-one image + Compose cover "try it" and "run it small"; the Helm charts cover AWS, other clouds, and scale from one set of manifests.

---

## 11. Startup & self-host resilience

Principle: **fail loud, fail early, fail with a fix.** Preflight gate before the app serves traffic.

**Required (refuse to start):** Postgres + PostGIS, object store, Keycloak, DB migration state.
**Optional (degrade + warn):** email (→ `log` mode), climate API credentials (ingestion disabled), Expert Analytics / RAG.

```
[ ok ] config schema valid
[ ok ] database reachable, PostGIS present
[ ok ] migrations current (head)
[ ok ] object store bucket reachable
[ ok ] keycloak discovery reachable
[warn] MAIL_TRANSPORT=smtp but SMTP_HOST unset — falling back to 'log'
[fail] DATABASE_URL is not set. Copy .env.example → .env. See docs/deploy.md#database.
       → refusing to start
```

- Config validated against a typed schema (pydantic-settings / env schema) before anything else.
- Migrations gated: current → proceed; behind → migrate-and-log or refuse; ahead → refuse (downgrade hazard). `AUTO_MIGRATE` config flag (auto for self-host, manual for Scope prod).
- Fatal failure → non-zero exit (container fails fast). Degraded → boot banner + `/health` (liveness) and `/health/ready` (all required deps green).
- **Email:** `MAIL_TRANSPORT=smtp|log|disabled`. Default `log` (open-source). Scope sets `smtp` with a provider (Mailgun/SES/Brevo — plain SMTP, no lock-in) via env secrets. Every email flow has a defined off-behaviour (approval flips status silently, reset admin-mediated). Invites are signed links email merely delivers.

---

## 12. Risks & open questions

| Severity | Item | Impact / handling |
|---|---|---|
| HIGH | Can Expert Analytics downscale **projections**, not just historical? | If not, projection can't reach 1 km; Kajiado too coarse. Decides Kenya viability. |
| HIGH | Model-handoff grain (geography level + temporal granularity) | Sets `climate_run` input + `health_impact` output shape. Hakim ↔ McQueens. |
| HIGH | **Scenario & source alignment** predictive vs VRA | Predictive = ISIMIP/CMIP under **SSP**; VRA hazard = **IMD** under **RCP 4.5/8.5**. Different frameworks/sources risk inconsistent climate stories. CEEW (Vanya) to confirm. |
| HIGH | Legal data-processing entity (Scope vs government) | One source interface supports both. Build proceeds while legal resolves. |
| HIGH | **Zonal aggregation method** (`district_climate.agg_method`) | Area-weighted mean vs centroid vs interpolation, at what resolution. McQueens can answer from R code. Blocks `zonal.py`. |
| HIGH | Prediction geography authorization during Python migration | Bearer authentication alone is insufficient. Submission and status lookup must map `location_slug`/request rows to Keycloak geography claims, with denial tests, before production. |
| HIGH | Shared-infrastructure coupling | Reuse Halla's modules and AWS bootstrap, not its live workload/database. CHART requires separate state, names, stores, namespace, and compute lifecycle. |
| MED | VRA ↔ predictive integration | Presented **separately** for MVP (CEEW position); full fusion beyond this year. |
| MED | VRA methodology (CEEW-owned, pending) | Chosen: IPCC AR5, country-specific indicators. Open: spatial scale, static vs dynamic, composite vs normalisation, Delphi vs PCA weighting. |
| MED | Policy counterfactual ("cut temp 5° → LBW prevented") | Scoped deferred, but McQueens frames as natural ERF output. Confirm MVP vs later. |
| MED | Projection source ISIMIP → EZMIE | Adapter treats dataset as swappable. |
| MED | Score semantics per surface | RR / attributable fraction / attributable numbers all have CIs. Pick the headline per UI surface. |
| MED | Risk formula multiplicative (H×E×V) vs additive | Materially different numbers. |
| LOW | AWS Open Data equivalence for ERA5 | Diff a slice vs the modeler's source before switching to the free-egress path. |
| LOW | Reference temperature, SSP medium pairing, animation need | Confirm; none block architecture. |


**Out of scope (MVP):** public hosting of raw microdata (only outputs/parameters persist); intervention-impact "act and risk drops by X" layer; outcomes beyond LBW/infant mortality; flooding beyond a selector stub.

---

## 13. Suggested build order

A pragmatic sequence to get from empty repo to a demoable MVP:

1. **Reconcile and protect the migration** — update this TDD, `AGENTS.md`, and Backlog; remove the Next-BFF plan; require geography authorization and parity before deleting Fastify.
2. **Merge the authenticated prediction stack** — Python Keycloak verification, idempotent Postgres request, Dagster sensor/job, missing-climate preparation, deterministic R result, status polling, tests.
3. **Provision the hosted proof** — generalise the tested Halla OpenTofu modules, create separate CHART state/RDS/S3/k3s resources, and bootstrap Flux + External Secrets.
4. **Ship immutable workloads** — CI builds versioned CHART images; CHART manifests deploy web, Python, Dagster, Keycloak, R inference, and migrations. No builds or handwritten `.env` files on the host.
5. **Prove one end-to-end production flow** — authenticated request → durable row → Dagster run → missing data pulled once → deterministic result → status API → database and UI evidence.
6. **Complete the scientific/data-model gap** — `erf_parameters`, `health_impact`, attributable metrics, Kajiado fitted curve, PostGIS boundaries, and the generated frontend client.
7. **Continue the Python strangler** — geographies/hazards, workspaces/users, analytical reads, then remove Fastify/Drizzle after parity.
8. **VRA** — wait for the CEEW methodology decision; keep it parallel to predictive.

> The immediate showcase path is **1 → 2 → 3 → 4 → 5**. Optional explanation inference and its hardware plan are a separate follow-up after the deterministic production flow is measured.
