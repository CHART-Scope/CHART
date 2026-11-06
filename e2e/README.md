# End-to-end verification

Run `make e2e`. Existing compatibility suites run first; the new
`make e2e-outlook` target exercises the real API, PostGIS, Keycloak login and
browser without intercepted requests or authentication overrides.

`make e2e-orchestration` also drives the recent-month top-up: the real Dagster
sensors and job pull two missing ERA5 months for two Kenyan counties from a
synthetic cached grid, apply each county's heatwave threshold, and leave
evidence in `outputs/e2e/orchestration/recent-climate-top-up/`. `make e2e-core`
builds the core wheel and checks it ships every runtime JSON file
(`outputs/e2e/core/package-data.json`).

Prerequisites: Docker with `chart-postgis:16`,
`quay.io/keycloak/keycloak:26.6.4` and `axllent/mailpit:v1.30.0`, the repository Python and web dependencies,
Playwright Chromium, and the four extracted modeller handovers in
`~/Downloads/OneDrive_1_26-10-2026` (override `CHART_HANDOVER_ROOT`). Install the
Python handover extra as described in the modelling documentation. This suite
fails explicitly when prerequisites are unavailable.

The outlook suite serves an isolated production web build and starts uniquely
named disposable containers on free loopback ports, migrates a fresh database,
publishes a representative 2027 start year
with 5/10/20-year windows plus the supplied original periods, and registers
geographies twice to verify retry safety. It uses real signed Keycloak tokens
for separate India/Kenya planning users and a denied-role user. It verifies
published district/constituency coverage, persisted parent relationships,
selection errors, authentication/authorization, scope isolation, unavailable
observed estimates, browser selectors and session restoration.

Browsers sign in the way people do ([sign-in](../docs/sign-in.md)): the run
builds the deployment's `chart-keycloak` and `chart-keycloak-config` images
from `infra/keycloak/Dockerfile`, serves Keycloak under `/identity` with its own
database, applies the sync image to its disposable realm, Keycloak emails
each code to the run's own Mailpit, and `e2e/emailCode.ts` reads it through
Mailpit's API. `email-code-signin-live.spec.ts` checks that a wrong code is
refused, that an account an administrator adds through the API has no password
and signs in with an emailed code, that disabling it stops sign-in, and that an
unknown address gets an error and no email. An administrator invites someone
in Settings → Users; the invitation arrives in Mailpit, its link is accepted,
and the invited person signs in with a code and lands on their area's
dashboard; "Send invitation again" emails a second link. The Keycloak
administration sign-in is checked for CHART's look. The default `admin` signs
in with `admin`/`admin`, must choose a new password, lands on Settings → Users
and can invite; the first password then stops working. API tests still take tokens by
password grant, which only the disposable realm allows.

An upgrade regression recreates the legacy fixed-level checks on the disposable
database, proves that registration fails atomically, applies migration 029 and
registers the publication twice. It verifies that geography foreign keys and
the existing path constraint survive. Browser regressions cover Gwalior and
Kajiado drill-down/back navigation, both outcomes and views, reload/history,
retained filters, and a district-only user's permitted map.
The shared geography pickers also verify level-consistent aggregate labels
(all divisions, counties, districts and constituencies). Selecting a child and
then the aggregate restores its parent map and filters in both outlook views;
the same labels and clear-selection behavior are checked on VRA pages.

Observed regressions persist disposable monthly/daily climate inputs for Kenya
and stored monthly results with exact active model assignments for India. They
verify both outcomes alongside the new projections, source-release labels
(including historical results from an older model), county maps, country
settings, denied scopes, incomplete observations and publication failure/recovery.
Kenya's LBW fixture matches a supplied R validation case through the real API;
India's stored-result fixtures verify retrieval and display, not a new R run.
No observed model is assigned to the new districts or constituencies.

Climate-pull recovery uses the same disposable API, identity service and
PostGIS database, together with persisted Dagster run records. It verifies
failed/canceled worker recovery, retry creation, active-run preservation and
administrator-only access. `make e2e-era5`, also included in `make e2e`, runs
the actual ERA5 CLI against synthetic NetCDF caches with two download workers,
verifying repeated cache reuse and saved monthly values. An unexpected cache
miss targets a closed loopback port, never the real Copernicus service.
Its evidence is under `outputs/e2e/sandbox-climate-recovery/era5-cache/`.

A separate live climate regression submits actual country-pull jobs through the
API and runs the sensor/worker against synthetic retained NetCDF data. It adds
a district smaller than a cell, verifies persisted overlap-weighted inputs,
parent-input preservation, raw acquisition reuse, input-reader compatibility,
and idempotent repeats. No external climate service is contacted.

VRA data-entry regressions download real blank templates, fill synthetic values,
upload through authenticated HTTP, inspect PostGIS persistence, retry uploads
and rerun assessments. They cover range/type/unit rules, invalid headers and
rows, duplicate keys, blanks, authorization and geography scope. Unrecoverable
CSV quoting must reject the whole file without writes; ordinary row-width errors
retain valid rows. A real district-scoped reader cannot use its own leaf link to
expand assessment access to siblings or their parent frame. Browser checks
exercise the single upload dialog at desktop/mobile widths, keyboard focus and
Escape, staging/canceling a file without a request, full and per-indicator
templates, selected-template enforcement, explicit validation and correction.
They run an assessment and distinguish a recorded zero, a nonzero value with relative score
zero, a small positive score, and missing data. Synthetic CSVs, assessment hashes
and screenshots are saved with the live suite evidence.

Saved-plan regressions save plans through authenticated HTTP and check the
persisted PostGIS rows against the dashboard's own projection figure and the
validated Kajiado observed month. They cover privacy between users, geography
scope (including a district-only planner), denied roles, invalid areas and
selections without writes, and repeated deletes. The planning catalogue must
never list a published outcome under an "unspecified" health domain. In the
browser a planner saves a view from the dashboard, opens its ranked
recommendations and placeholder AI insight, reopens it from Start planning,
removes it and sees an explicit error for a missing plan.

Recommendation regressions run against a local stand-in for an
OpenAI-compatible model server and the classifier (`e2e/stub_ai_server.py`, on
loopback; real provider keys are cleared for the run and no provider is
contacted). They verify the rules ranking, ownership and roles, admin-only
settings with persisted values and audit events, refused settings without
writes, the provider's model list, classifier ordering, the generated insight
and its reuse, and explicit fallbacks when the classifier or model fails. In
the browser an administrator picks a model from the provider's list and the
sidebar lists Learning hub below Start planning.

The action repository runs end to end without Airtable or S3. The same
stand-in plays Airtable over `e2e/fixtures/airtable_actions.json`, which has
drafts, contact fields, an image and two rows per page. The real publisher
(`chart.actions.publish`) turns those rows into the feed, and the stand-in
serves it as the public file. `e2e/test_actions_live.py` checks that only
Published rows and allowed fields are published, with images copied and
references parsed. It also checks that an empty base or a bad token publishes
nothing. Over HTTP it checks that a place gets its own country's actions in
its own wording, that an unknown place gets a 404, and that a feed that goes
down or turns invalid keeps the last good copy. A fresh API that cannot reach
any feed serves the bundled copy. Recommendations rank these published
actions, and the browser shows Kenya's wording and never India's actions or a
draft. The feed and its publish log are kept under `actions-feed/` and
`actions-publish.log` in the run's evidence.

The same live browser suite checks shared typography at desktop and mobile widths
across the landing page, learning search and player, onboarding, planning,
settings, projections and action details/forms. It signs in through Keycloak,
checks computed font families and token sizes, checks horizontal overflow,
verifies saved settings and action progress after reload, and captures each
screen, including CHART's Keycloak theme and unknown-account errors. An
administrator also visits every settings section. These checks use
the real application and its bundled content fallback, with no intercepted
requests. At desktop and mobile widths, the public landing checks verify that
the hero video precedes the dashboard preview, uses shared typography/design
tokens, and plays from its real public media URL only when activated. This
playback check requires network access to the public video bucket. Chromium
DNS rules block the former Google Fonts hosts; loaded font
faces and resource timing must show Fira Sans and Noto Sans Display loading
from the same origin as the app or sign-in page. Font evidence is saved beside
the screenshots. Real HTTP checks also verify that the production web package
serves the Open Font License notices for all three bundled font families.
Embedded third-party video styling is outside CHART's design
system.

To verify a full publication already produced by the importer, set
`CHART_E2E_PUBLICATION=/absolute/path/to/model-cache/outlooks`. The suite copies
it into its disposable cache; it never writes to the provided publication.
This mode exercises publication consumption rather than regenerating grids.

Evidence is saved under `outputs/e2e/outlook/<run-id>/`: revision and working
tree status, setup description, migration/import logs, API/browser JUnit,
application logs and screenshots. Tokens and disposable credentials are never
written to evidence. Browser traces are disabled because they capture bearer
tokens. All containers and temporary credentials are removed on completion.
The existing compatibility suites retain their own evidence locations; their
mock-backed checks do not substitute for this live suite.
