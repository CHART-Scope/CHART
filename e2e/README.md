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

The same live browser suite checks shared typography at desktop and mobile widths
across the landing page, learning search and player, onboarding, planning,
settings, projections and action details/forms. It signs in through Keycloak,
checks computed font families and token sizes, checks horizontal overflow,
verifies saved settings and action progress after reload, and captures each
screen, including CHART's Keycloak theme and invalid-login errors. An
administrator also visits every settings section. These checks use
the real application and its bundled content fallback, with no intercepted
requests. Chromium DNS rules block the former Google Fonts hosts; loaded font
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
