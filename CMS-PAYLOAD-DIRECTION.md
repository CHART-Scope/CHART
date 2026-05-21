# CHART CMS Direction

## Purpose

Document the intended CMS architecture for CHART before building a custom backend around the current CMS page.

## Current status

The current `Content studio` UI in CHART is treated as:

- a workflow prototype
- a UX reference
- a content model sketch backed by a Payload CMS workspace in `apps/web`

The React app no longer needs to own long-term CMS storage.

## Design decision

CHART should use the existing CMS direction already proven in Halla Health.

### Recommendation

- keep the current CMS UI as the prototype
- use Payload CMS as the actual content backend
- connect the CHART CMS experience to Payload APIs rather than building a separate localStorage or custom CMS backend

## Why

Payload CMS already provides most of what CHART needs:

- collections
- admin UI
- publishing workflows
- API access
- auth and permission patterns
- extensibility

This avoids inventing custom CMS primitives too early.

## What the current UI should mean

The current UI is useful for:

- testing editorial flow
- testing content grouping
- testing content review states
- testing how public resources and managed content should feel

It is not the target storage architecture.

## Proposed implementation split

### Payload CMS should own

- content collections
- create / edit / publish workflow
- content API
- admin authoring experience
- role-based content permissions

### CHART web app should own

- public-facing UX
- dashboard UX
- planning workspace UX
- CMS workflow prototype and integration layer
- API consumption from Payload

## Recommended content model mapping

### Collection: `solutions`

Maps from:

- HeatCare Kit
- Cool-roof retrofit guide
- training packs

### Collection: `models`

Maps from:

- Heat-MNCH risk index
- climate-health model notes

### Collection: `vraResources`

Maps from:

- indicator catalogues
- vulnerability and resilience guidance

### Collection: `landingContent`

Maps from:

- hero blocks
- public resource cards
- feature copy

### Collection: `submissions`

Maps from:

- incoming external contributions
- import / review queue

## Immediate app-level rule

The web app talks to CMS data through a small repository boundary. Payload and Postgres are the source of truth.

## Follow-up implementation plan

### Phase 1

- keep the current CMS UX
- add a Payload CMS module inside the web app
- define CHART collections in Payload

### Phase 2

- expose CHART content through Payload-backed APIs
- connect the current CMS UX to those APIs
- keep the same UX where possible

## Implemented now

- `apps/web` provides the Payload admin panel and content collections
- CHART content is stored in Payload collections rather than localStorage
- the Next app reads and writes through a thin CMS bridge API

## Rule going forward

Do not build custom CMS primitives unless Payload cannot support a specific CHART requirement.
