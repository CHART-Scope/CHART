# Learning hub: product requirements

Status: written 2026-09-14, after a first implementation. This records what
the feature must do and why, so the next person changing it knows which
behaviours are deliberate. The architecture is in
[learning-hub-design.md](learning-hub-design.md).

## Problem

CHART tells a planner what their climate-health risk is and what actions
could reduce it. It does not help them understand the subject. A district
health officer meeting heat-attributable low birth weight for the first time
has no route from "the dashboard says this" to "I know enough to act on it".

Material exists — WHO, the Red Cross, national programmes, research
consortia have all published it — but it is scattered across dozens of hosts
and nobody in a county health office has time to find it.

## Who this is for

The same people the dashboard is for, in roughly this order:

| User | What they need from it |
| --- | --- |
| District and county health officers | A short, credible explainer they can watch between meetings |
| Planning leads | Enough grounding to defend a plan to a funder or a colleague |
| Clinical staff | Outcome-specific material — heat illness management, heat in pregnancy |
| Public visitors | The ability to read the subject without an account |

It is explicitly **not** a training platform. Nobody is assessed, nothing is
certified, and no one's employer sees their progress.

## Scope

### Must

1. Browse the hand-picked shortlist. The wider catalogue is seeded and served
   behind `include=all`, but is not shown yet.
2. Find material by **where it applies** — the catalogue is grouped into
   country sections, and within each into the module it belongs to.
3. Search across title, organisation, format, description and tags, and
   filter to one country — Global, Kenya, India — from the place pills.
4. Play embeddable video inline; everything else opens at its source.
5. Show, for every item, the organisation behind it. Provenance is the
   credibility signal — "WHO" or "Kenya Red Cross Society" is doing more work
   than any description.
6. Signed in: remember what has been watched, offer the part-watched item
   back, and rank suggestions with a stated reason.

### Must not

7. Claim a resource is playable when it has no embeddable media at all — a
   course page, an article, a PDF. Those link out. YouTube resources are
   played and the platform enforces the uploader's own embed setting.
8. Present material about unrelated products that share the CHART name as if
   it were about this one.
9. Assess, score, certify, or report a user's activity to anyone else.
10. Claim a health outcome for a resource that does not evidently address one.

### Out of scope for now

Editing content in the app (the `content_editor` role exists but has no
screens), downloads, playlists, comments, multi-language UI, and any notion
of a course, cohort or completion certificate.

## Requirements in detail

### Content

- **R1.** The catalogue is seeded from a curated spreadsheet via a repeatable
  script. Re-running it must be idempotent on `slug`.
- **R2.** Ingest repairs the source data rather than trusting it: drifting
  label names merged, `;`-joined cells split, four YouTube URL shapes
  canonicalised, mixed date encodings branched, free-text durations parsed to
  nullable seconds, continuation rows dropped.
- **R3.** A resource with no recorded duration shows no duration and is
  excluded from length filters. 62 of 99 rows have no duration; guessing
  would be worse than omitting.
- **R4.** Health outcomes are derived at ingest from an explicit keyword map,
  stored as data, and reviewable. Roughly half the catalogue carries none.
- **R5.** Resources about a different product named CHART are ingested
  unpublished and tagged, so an editor can see them and a reader cannot.

### Behaviour

- **R6.** The API's reads (`/learning/resources`, `/taxonomies`, `/tracks`)
  are unauthenticated; everything under `/learning/me` requires a session and
  is scoped to the caller. The *page* is behind `RequireAuth` regardless, so
  its chrome matches every other page — see R20.
- **R20.** The Learning hub uses the same `AppShell` and the same
  `appNavForRoles` nav as every other page, with a guaranteed session. One
  navigation, reused. No page may render a variant of the product chrome.
- **R7.** Facet vocabularies are derived from the published rows at read
  time, never stored, so a reseed cannot orphan a filter value.
- **R8.** Watch progress is a high-water mark. It never decreases, and
  opening then closing a player must not mark anything complete — watch time
  is measured from how long the player was open, capped at the duration.
- **R9.** Completion means only that a viewer reached the end. It carries no
  other meaning anywhere in the product.
- **R10.** Every recommendation states why it was chosen ("Because you work
  in Kenya"). An unexplained ranking reads as arbitrary and is not worth
  shipping.
- **R11.** Country names for place-based ranking come from the geography
  table, not a hardcoded list.

### Interface

- **R12.** The hub renders useful content before the API answers, from a
  small checked-in slice, and swaps to live data when it arrives.
- **R13.** Grouping into sections and modules is computed in the browser from
  data the API already sends. Layout must not require a new endpoint.
- **R14.** A country with fewer than three resources folds into Global; a
  one-item section reads as a stub rather than a place worth jumping to.
- **R17.** A resource that cannot be played must not show a play triangle.
  Link-only cards show an open-in-new glyph instead.
- **R19.** Unconfirmed embed permission is not a reason to refuse playback.
  The platform enforces the uploader's choice; the interface says so and
  offers the source link when it might not start.
- **R18.** The hub shows only `is_featured` resources. Opening the wider
  library must not require re-ingesting or re-deploying content — it is a
  change of default on one query parameter.
- **R15.** All colour, spacing and type come from `web/src/styles/tokens.css`.
  Motion respects `prefers-reduced-motion`. Touch targets are at least 44px.
- **R16.** Empty states offer a way out rather than dead-ending.

## Acceptance

A build is acceptable when, in addition to the repository's standard gates:

- a signed-in user can browse and play the shortlist from `/learning`, with
  the same sidebar, username and sign-out as every other page;
- selecting a place pill narrows to that country and the other pills keep
  their full counts;
- `?include=all` returns the whole catalogue and the default does not;
- filtering by a health outcome returns only resources carrying it;
- a resource with no embeddable media never renders a player;
- a YouTube resource with unconfirmed permission does play, and shows the
  fallback note;
- opening and immediately closing a player leaves the item incomplete;
- a Kenya-scoped user sees Kenya material ranked first, with that reason
  shown;
- `core/tests/test_learning_api.py` passes, including the 401 on every
  `/me` route and the 404 on an unknown slug.

## Known gaps

These are real and should not be discovered again from scratch:

| Gap | Consequence |
| --- | --- |
| Only 8 of 96 resources are shown | Deliberate: the shortlist is what a human curated. The rest are one flag away. |
| 76 of 96 resources have unconfirmed embed permission | They are played anyway; YouTube enforces the uploader's setting and the modal warns that a blocked video may need opening at source. |
| 48 of 96 carry no health outcome | The primary filter reaches half the catalogue. |
| 57 of 96 have no description text | Cards for those show a title and organisation only. |
| No link-liveness checking | A dead URL stays in the catalogue until someone notices. |
| Search happens client-side over the full fetch | Instant, but it duplicates the server's search; the two can drift. Acceptable at 96 rows, not at 1,000. |
| `health_outcomes` is stored and filterable but unsurfaced | The API supports `?outcome=`; no control exposes it since the redesign. |
| `/learning/me` recommendations are unused by the page | Progress is still recorded, but the ranked picks and "Continue watching" row have no home in the approved design. |
| No editing UI | Content changes require re-running the ingest script and a deploy. |

## Open questions for product

1. Should health outcome come back as a control? It is derived, stored and
   filterable through the API, but the approved design has no filter bar.
2. Should the recommendation engine be removed, or given a home? It ranks by
   place, role and track and explains itself, but nothing renders it.
3. Does the hub need to reach non-English speakers in the UI, given the
   catalogue already carries Swahili and Hindi material?
4. Who owns the catalogue after launch, and how often is it refreshed?
