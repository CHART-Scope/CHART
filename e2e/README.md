# End-to-end verification

Run `make e2e`. Existing compatibility suites run first; the new
`make e2e-outlook` target exercises the real API, PostGIS, Keycloak login and
browser without intercepted requests or authentication overrides.

Prerequisites: Docker with `chart-postgis:16` and
`quay.io/keycloak/keycloak:26.6.1`, the repository Python and web dependencies,
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

The same live browser suite checks shared typography at desktop and mobile widths
across the landing page, learning search and player, onboarding, planning,
settings, projections and action details/forms. It signs in through Keycloak,
checks computed font families and token sizes, checks horizontal overflow,
verifies saved settings and action progress after reload, and captures each
screen, including CHART's Keycloak theme and invalid-login errors. An
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
