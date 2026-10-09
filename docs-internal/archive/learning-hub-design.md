# Learning hub: proposed architecture

Status: implemented on 2026-09-14 from the curated reference sheet
`Learning Hub references.xlsx`; this note records the decisions and what was
verified against the source material. Revised the same day, twice: the
curriculum pathway was cut, then the whole page was rebuilt to the approved
`Learning hub prototype` design.

## Decision

Keep two independent concepts: the **resource** (one catalogued item) and the
**viewer's state** (what they have watched). Every label the sheet carries —
health outcome, track, language, place, format — is a denormalised array on
the resource, with the facet vocabulary derived at read time, the same choice
`recommended_action` makes.

**The hub opens on a shortlist.** Only the eight hand-picked rows from the
`Top Vids` sheet are shown. The other 88 published resources are seeded and
reachable through the API with `include=all`, so widening the library later
is a flag rather than a re-ingest. `learning_resource.is_featured` carries
this; the ingest script sets it from the sheet the row came from.

**The page is grouped, not filtered.** The approved design organises the
catalogue into country sections, and within each into the curricular module
a resource belongs to. Search is the only control besides a jump-to nav.
Two earlier revisions — an ordered curriculum pathway, then a filter bar led
by health outcome — were both cut in favour of this.

`learning_track` therefore supplies the module heading and its one-line
subtitle. `health_outcomes` is still derived, stored and filterable through
the API, but nothing in the interface surfaces it today.

The hub does not assess anyone. It has no quizzes, no certificates and no
notion of passing; "completed" means only that a viewer reached the end of a
film.

**The page sits behind `RequireAuth`, like every other page.** An earlier
revision made it public, on the strength of the AGENTS.md rule that published
content stays readable without an account. That was reverted: without a
session the shell loses the username, the sign-out control and the admin
Settings entry, so the navigation differed from the rest of the product. One
navigation, reused everywhere, beat one page's public access. The read
endpoints themselves remain unauthenticated, so opening the page up later
needs no backend change.

The word `module` was avoided throughout. It already means the analytical
module in model-release manifests, and `onboarding` already means installation
setup.

## What the supplied file contains

| Measure | Count |
| --- | --- |
| Rows carrying a URL | 109 |
| Unique URLs | 100 |
| Resources after cleaning | 99 |
| Unique embeddable YouTube videos | 50 |
| Rows with confirmed embed permission | 20 |
| Rows with no access column at all | 62 |
| Durations recorded as unknown or absent | 62 |

The workbook holds three sheets — a human shortlist (`Top Vids`) and two
research sweeps (`Claude`, `Gemini`). The first and third share a twelve-column
schema; the second is a thinner nine-column variant whose `Topic` column uses
the same vocabulary as `Curricular Module`.

This establishes structure and counts. It does not establish that any link is
still live, nor that the unverified embed permissions are in fact grantable.
Neither was checked.

## Existing foundations to reuse

- `core/chart/solution_repository/routes.py` — public, filterable,
  taxonomy-tagged content reads with a derived vocabulary endpoint.
- `core/chart/setup/service.py` — `_auto_seed_recommended_actions` is the
  idempotent slug-keyed upsert pattern the learning seed copies.
- `web/src/components/` — `Pill` for interactive filters, `Chip` for display
  tags, `Panel`, `Modal`, `TextInput`. No new primitive was needed.
- `web/src/features/chrome/appNav.ts` — the nav entry already existed.
- `web/src/features/dashboard/RecommendedActionsPanel.tsx` — the
  render-fallback-then-swap-in-live-data pattern.

## Layers and contracts

1. **Catalogue layer:** `learning_resource`. Identity is `slug`. Carries
   `kind`, `embed_status`, `duration_seconds` (nullable), `countries`,
   `languages`, `health_outcomes`, `tracks`, `tags`.
2. **Vocabulary layer:** `learning_track` holds display titles for the track
   labels. Health outcomes have no table; they are label arrays only.
3. **Viewer layer:** `learning_progress` (high-water mark per resource) and
   `learning_preference` (self-declared audience and interests). Both cascade
   with the user row.

A declared audience does not grant any permission. Preference is for ranking
only, and is deliberately separate from the Keycloak role.

**Health outcomes are derived, and half the catalogue has none.** A keyword
map in the ingest script matches title, objectives, audience and tags against
eight outcomes. 48 of 96 published resources match at least one. The rest are
general climate-health, governance, funding or tooling material that is not
about a single outcome, and are deliberately left untagged rather than forced
into a bucket. Filtering by an outcome therefore hides them, which is correct.

## Backend and frontend ownership

Endpoints:

```txt
GET  /learning/resources      public
GET  /learning/taxonomies     public
GET  /learning/tracks         public
GET  /learning/me             authenticated
PUT  /learning/me/preferences authenticated
PUT  /learning/me/progress    authenticated
```

The web app owns card shape, spacing, colour, and the grouping of resources
into sections and modules; the API owns what a resource is and whether it may
be embedded. Grouping is computed in the browser from data the API already
sends — countries and tracks — so no endpoint changed to support the layout.

A country with fewer than three resources folds back into Global rather than
standing as a one-item section.

## Embed permission: let the platform enforce it

Any YouTube resource plays in the modal. Only `embed_status = "restricted"` —
which in practice means "no embeddable media at all", such as a course page,
an article or a PDF — refuses, and links out instead.

An earlier revision played only `embeddable` rows and linked out for the
rest. That was wrong: YouTube enforces the uploader's embed setting itself
and serves its own "Watch on YouTube" panel when embedding is off, so
refusing to try only hid videos that would have played. Three of the eight
shortlisted resources were hidden this way.

Where the sheet did not confirm permission the modal still says so, with a
link to the source, so a blocked video is a one-click detour rather than a
dead end.

## Data defects repaired at ingest

`core/scripts/build_learning_seed.py` is run by hand against the workbook and
writes both `core/chart/learning/seed.json` and the web fallback slice.
It repairs:

- drifting track names merged onto eight canonical slugs;
- `;`-joined multi-value cells split;
- four YouTube URL shapes canonicalised to a video id, de-duplicating nine
  cross-sheet repeats;
- a date column mixing Excel serials with bare years;
- free-text durations parsed to nullable seconds, keeping the original label;
- continuation rows that annotate the row above rather than standing alone.

**Three rows describe a different product that shares the CHART name** — UW
EarthLab's CHaRT tool, the UW CHanGE intervention study, and the Emory CHART
Center's grants. The Gemini sheet files all three under *What CHART Does for
Planning and Funding*, where they would mislead a planner; the Claude sheet
flags one itself as a name collision. They are ingested with
`is_published = false` and tagged, so an editor can see them without a reader
finding them.

## Testing

`core/tests/test_learning_api.py` covers public reads, unpublished exclusion,
facet derivation, the 401 on every `/me` route, the 404 on unknown slugs,
progress not moving backwards, and completion counting towards a track. The
frontend has no test runner; Storybook is the visual surface, with stories for
each card variant and for the signed-out, signed-in and empty library states.
