"""Curated OpenAPI copy for every public CHART operation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


@dataclass(frozen=True)
class OperationDocumentation:
    summary: str
    description: str
    success_responses: dict[str, str]


OPERATION_DOCUMENTATION: dict[
    tuple[str, str],
    OperationDocumentation,
] = {
    ("get", "/auth/me"): OperationDocumentation(
        summary="Resolve the signed-in user's CHART access context",
        description=(
            "Validates the Keycloak bearer token and returns the CHART user, roles, "
            "allowed geography paths, and active geography used to scope subsequent "
            "requests. Supply an active geography only when the user can access it."
        ),
        success_responses={
            "200": "The authenticated user's role and geography access context."
        },
    ),
    ("get", "/auth/geography-access"): OperationDocumentation(
        summary="Check the current user's access to one geography",
        description=(
            "Normalizes the requested geography path and evaluates it against the "
            "signed-in user's role and assigned geography scope. Use this before "
            "showing geography-specific controls; protected endpoints still enforce "
            "the same authorization independently."
        ),
        success_responses={
            "200": "The normalized geography path and the user's access decision."
        },
    ),
    ("get", "/geographies"): OperationDocumentation(
        summary="List application geographies available for planning",
        description=(
            "Returns database-backed countries and administrative areas known to "
            "CHART, including hierarchy and prediction-support metadata. This public "
            "catalog drives place selection; protected analytical routes apply user "
            "scope separately."
        ),
        success_responses={
            "200": "The ordered application-geography catalog and hierarchy metadata."
        },
    ),
    ("get", "/climate/locations"): OperationDocumentation(
        summary="List places with a configured climate-model release",
        description=(
            "Returns only locations that have the boundary, climate inputs, and active "
            "model assignment required for prediction. Use the returned identifier in "
            "planning-options, preview, and prediction requests."
        ),
        success_responses={
            "200": "The model-ready location choices accepted by climate operations."
        },
    ),
    (
        "get",
        "/climate/planning-options/{geography_id}",
    ): OperationDocumentation(
        summary="Resolve valid planning windows for a model-ready place",
        description=(
            "Builds the date choices supported for the selected geography, including "
            "the next three months, the configured hot season, and available long-term "
            "scenario periods. The response reflects current climate and model "
            "availability rather than a hard-coded calendar, narrowed by the "
            "country's model settings for the outcome (windows, scenarios and data "
            "modes switched off are withdrawn or marked MODEL_DATA_MODE_DISABLED)."
        ),
        success_responses={
            "200": "Planning modes, dates, and scenarios currently supported for the place."
        },
    ),
    ("post", "/climate/preview"): OperationDocumentation(
        summary="Preview the exact climate records used by a planning window",
        description=(
            "Resolves a planning request into three consecutive monthly climate "
            "records without executing the health model. Each value includes source "
            "and freshness metadata so callers can inspect the model inputs before "
            "submitting a prediction."
        ),
        success_responses={
            "200": "Three ordered climate inputs with provenance and availability details."
        },
    ),
    ("post", "/climate/predict"): OperationDocumentation(
        summary="Submit or reuse a durable climate-health prediction",
        description=(
            "Validates role and geography scope, resolves the three-month input window, "
            "and creates or reuses an idempotent prediction request in Postgres. A 200 "
            "response contains an already completed result; a 202 response identifies "
            "queued work that Dagster will execute."
        ),
        success_responses={
            "200": "A completed or previously completed prediction with source traceability.",
            "202": "A queued prediction request and status URL for polling its progress.",
        },
    ),
    ("get", "/climate/prediction-requests"): OperationDocumentation(
        summary="List prediction requests visible to the signed-in user",
        description=(
            "Returns recent durable prediction requests for the requested geography, "
            "limited to records owned by and authorized for the current user. Entries "
            "include status and timestamps so the planning interface can restore work "
            "after a reload."
        ),
        success_responses={
            "200": "The user's recent authorized prediction requests in newest-first order."
        },
    ),
    (
        "get",
        "/climate/prediction-requests/{request_id}",
    ): OperationDocumentation(
        summary="Read one prediction request and its current result",
        description=(
            "Returns the durable state of a user-owned prediction request, including "
            "queued, running, completed, or failed status and the model result when "
            "available. The route rejects requests outside the caller's user and "
            "geography scope."
        ),
        success_responses={
            "200": "The authorized request's current execution state and available result."
        },
    ),
    ("get", "/setup"): OperationDocumentation(
        summary="Read the current CHART installation setup state",
        description=(
            "Reports whether initial bootstrap and application setup have been "
            "completed and which setup step is currently available. Clients use this "
            "public state to route a new installation without exposing bootstrap "
            "credentials or administrator details."
        ),
        success_responses={
            "200": "The installation's current bootstrap and setup-completion state."
        },
    ),
    ("get", "/setup/options"): OperationDocumentation(
        summary="List supported choices for initial installation setup",
        description=(
            "Returns the roles, geography choices, and other controlled values accepted "
            "by the setup forms. Fetch these values instead of embedding deployment-"
            "specific choices in a client."
        ),
        success_responses={
            "200": "The controlled role and geography choices accepted during setup."
        },
    ),
    ("post", "/setup/bootstrap"): OperationDocumentation(
        summary="Bootstrap the first administrator for a new installation",
        description=(
            "Uses the deployment's X-CHART-Bootstrap-Token to create or recover the "
            "initial CHART administrator and unlock authenticated setup. This route is "
            "for installation bootstrap only and must not be exposed with a reusable "
            "token after setup."
        ),
        success_responses={
            "200": "The bootstrapped administrator context and resulting installation state."
        },
    ),
    ("post", "/setup/complete"): OperationDocumentation(
        summary="Complete installation setup with an authenticated administrator",
        description=(
            "Persists the initial organization, role, and geography configuration for "
            "an authenticated setup administrator. Completion transitions the "
            "installation into its normal sign-in and planning flow."
        ),
        success_responses={
            "200": "The completed setup record and application-ready installation state."
        },
    ),
    ("post", "/setup/models/sync"): OperationDocumentation(
        summary="Install newly deployed model releases without resetting CHART",
        description=(
            "Requires a CHART administrator. Discovers enabled model manifests, "
            "verifies and prepares their immutable artifacts, and activates their "
            "geography assignments while preserving users, workspaces, and saved "
            "planning data. Use this after deploying a new release to an existing "
            "installation."
        ),
        success_responses={
            "200": "The active release IDs and total planning-area assignments."
        },
    ),
    ("post", "/setup/reset"): OperationDocumentation(
        summary="Reset installation setup for controlled recovery",
        description=(
            "Returns setup state to the recoverable pre-completion phase after verifying "
            "the caller's administrative authority. Use this operational endpoint only "
            "when intentionally re-running installation setup."
        ),
        success_responses={
            "200": "The reset setup state ready for an authorized recovery workflow."
        },
    ),
    ("get", "/hazards"): OperationDocumentation(
        summary="List public climate-health hazards",
        description=(
            "Returns the published hazard catalog from the configured solution "
            "repository API or bundled public snapshot. Hazard identifiers connect "
            "planning risks to the solution records returned by the repository routes."
        ),
        success_responses={
            "200": "The published public hazard catalog available to planning clients."
        },
    ),
    ("get", "/hazards/{hazard_id}"): OperationDocumentation(
        summary="Read one public hazard and its linked solutions",
        description=(
            "Looks up a published hazard by its stable identifier and includes the "
            "public solution records associated with it. The route reads the configured "
            "remote repository when available and otherwise uses the bundled snapshot."
        ),
        success_responses={
            "200": "The requested hazard together with its currently published solutions."
        },
    ),
    ("get", "/solutions"): OperationDocumentation(
        summary="Search and filter the public solution repository",
        description=(
            "Returns published climate-health actions filtered by hazard, solution "
            "type, cost, publication status, or free-text search. Results come from the "
            "configured repository service or the bundled snapshot and remain public "
            "without CHART sign-in."
        ),
        success_responses={
            "200": "The public solutions matching the supplied filters and result limit."
        },
    ),
    ("get", "/solutions/taxonomies"): OperationDocumentation(
        summary="List public solution taxonomy values",
        description=(
            "Returns the controlled hazard, solution-type, cost, and status values used "
            "to classify published actions. Clients can use this catalog to construct "
            "valid solution filters without duplicating repository vocabularies."
        ),
        success_responses={
            "200": "The current public taxonomy values used by solution filters."
        },
    ),
    ("get", "/users"): OperationDocumentation(
        summary="List users within the caller's administrative scope",
        description=(
            "Returns CHART users the authenticated caller is permitted to administer, "
            "constrained by role and geography assignments. The response is intended "
            "for user-management screens and does not grant access beyond the caller's "
            "existing scope."
        ),
        success_responses={
            "200": "The user accounts visible within the caller's role and geography scope."
        },
    ),
    ("post", "/users"): OperationDocumentation(
        summary="Create or invite a user within administrative scope",
        description=(
            "Creates the CHART user assignment requested by an authorized administrator "
            "after validating role and geography boundaries. The route coordinates the "
            "application identity record without allowing the caller to delegate "
            "permissions they do not hold."
        ),
        success_responses={
            "200": "The created or invited user and their effective CHART access assignment."
        },
    ),
    ("post", "/users/{user_id}/disable"): OperationDocumentation(
        summary="Disable a user within the caller's administrative scope",
        description=(
            "Disables the selected CHART account after confirming that the signed-in "
            "administrator may manage that user's role and geography. Disabled users "
            "remain auditable but can no longer use protected application workflows."
        ),
        success_responses={
            "200": "The disabled user record and its updated account state."
        },
    ),
    ("post", "/workspaces"): OperationDocumentation(
        summary="Create a geography-scoped planning workspace",
        description=(
            "Creates a durable planning workspace owned by the authenticated user and "
            "bound to an authorized geography. The workspace becomes the container for "
            "saved planning choices and analytical results."
        ),
        success_responses={
            "201": "The newly created planning workspace and its ownership metadata."
        },
    ),
    ("get", "/workspaces/{workspace_id}"): OperationDocumentation(
        summary="Read an authorized planning workspace",
        description=(
            "Returns a durable planning workspace only when the signed-in user has the "
            "required ownership, role, and geography access. Callers cannot use a known "
            "workspace identifier to cross authorization boundaries."
        ),
        success_responses={
            "200": "The requested workspace when it is visible to the authenticated user."
        },
    ),
    ("get", "/live"): OperationDocumentation(
        summary="Check whether the API process is alive",
        description=(
            "Returns a lightweight process-liveness signal without checking Postgres, "
            "schema revision, or active model configuration. Container orchestration "
            "uses this route to decide whether the FastAPI process itself is responsive."
        ),
        success_responses={
            "200": "The API process is running and able to answer HTTP."
        },
    ),
    ("get", "/ready"): OperationDocumentation(
        summary="Check whether the API is ready for production traffic",
        description=(
            "Checks database connectivity, the expected Alembic schema revision, and "
            "active model assignment when model readiness is required. A 503 response "
            "means the process is alive but must not yet receive production traffic."
        ),
        success_responses={
            "200": "Postgres, schema revision, and required model state are ready."
        },
    ),
    ("get", "/health"): OperationDocumentation(
        summary="Check readiness through the compatibility health route",
        description=(
            "Provides the same durable readiness checks as /ready for existing "
            "integrations that still call /health. New process-liveness probes should "
            "use /live, while traffic-readiness probes may use /ready directly."
        ),
        success_responses={
            "200": "The compatibility readiness check completed successfully."
        },
    ),
    ("get", "/climate/coverage"): OperationDocumentation(
        summary="Read which places already hold climate data",
        description=(
            "Returns every country and each of its administrative areas with the "
            "number of distinct months of observed climate data held, and the "
            "range those months span. Requires the chart_admin role. Months "
            "are counted distinctly rather than by row because each month "
            "holds several variables, which would otherwise read as several "
            "times more coverage than exists. A country's range is the union "
            "of its areas' ranges, not a sum. Used by the Settings data "
            "section to show what is present before anything is pulled."
        ),
        success_responses={
            "200": (
                "One entry per country with its areas nested, ordered by "
                "country code then area name."
            )
        },
    ),
    ("post", "/climate/ingestion-jobs"): OperationDocumentation(
        summary="Queue one country-wide climate pull",
        description=(
            "Queues a single Copernicus download covering every deployed area "
            "in one country and returns immediately with the job to poll. "
            "Requires the chart_admin role. Accepted rather than performed "
            "because a pull takes minutes while the web proxy times out after "
            "fifteen seconds. Omitting months requests the last twelve "
            "complete ones; the month in progress is never requested because "
            "ERA5 lands a few days in arrears. A country that already has a "
            "pull in flight returns that job rather than starting a second "
            "download of the same grid."
        ),
        success_responses={
            "202": ("The queued job, or the one already running for this country.")
        },
    ),
    ("get", "/climate/ingestion-jobs"): OperationDocumentation(
        summary="Read recent climate pulls and their progress",
        description=(
            "Returns recent country-wide climate pulls, newest first, with "
            "their status, stage, and how many of the country's areas have "
            "been written so far. Requires the chart_admin role. Progress is "
            "reported per area because one download feeds every area in the "
            "country, and a country of forty-seven would otherwise look "
            "stalled while it works."
        ),
        success_responses={
            "200": "Recent jobs, newest first, optionally filtered by country."
        },
    ),
    ("get", "/risk/{geography_id}/map"): OperationDocumentation(
        summary="Read administrative areas shaded by attributable fraction",
        description=(
            "Returns every administrative area beneath the selected geography "
            "with its display geometry and, where one exists, the share of "
            "cases attributable to heat for the requested month. Requires a "
            "risk reader role and access to the exact geography path. Areas "
            "with no fitted model for the outcome, and areas whose month has "
            "not been computed, are returned with a null value and a "
            "missing_reason of no_model or no_prediction rather than being "
            "omitted - a map that drops uncovered areas reads as though those "
            "places carry no risk. Geometry is simplified for drawing only, by "
            "the disclosed tolerance in degrees; climate extraction always "
            "uses the unsimplified boundary. These are area-level values on "
            "administrative shapes, not a modelled grid, and must not be "
            "rendered as cells."
        ),
        success_responses={
            "200": (
                "Areas beneath the geography with display geometry, bounds, "
                "and a value or a stated reason for its absence."
            )
        },
    ),
    ("get", "/heat-outlook/{geography_id}"): OperationDocumentation(
        summary="Read the pre-computed heat outlook for a Kenyan place",
        description=(
            "Returns the modelling team's pre-computed heat outlook for a Kenyan "
            "county (geo-ke-<county>) or for Kenya as a whole (geo-ke): a typical "
            "month by calendar month, and a summary for each period with its 95% "
            "CI, climate-model range and change from the baseline. The outcome "
            "selects low birth weight (lbw) or under-five mortality "
            "(under_5_mortality); scenario, period and selector (the pregnancy "
            "window or the age group) filter the tables. Requires a risk reader "
            "role and access to the geography path. No model is evaluated at run "
            "time: the tables are read from the model bucket mirror. The guides' "
            "display rules are applied here, so suppressed values arrive as null "
            "with the message to show in their place."
        ),
        success_responses={
            "200": (
                "The filtered typical months and period summary, the available "
                "options, and the notes the dashboard must display."
            )
        },
    ),
    ("get", "/heat-outlook/{geography_id}/map"): OperationDocumentation(
        summary="Read Kenyan counties shaded by annual-average heat share",
        description=(
            "Returns the counties of Kenya with their display geometry and the "
            "modelling team's annual-average heat-attributable share for the "
            "chosen outcome, scenario, period and selector, in the same shape as "
            "the risk map so the dashboard draws it identically. Requires a risk "
            "reader role and access to the geography path. Counties whose share "
            "is suppressed by the display rules carry missing_reason no_excess; "
            "windows with no period summary carry not_reported; counties with no "
            "published file carry no_model. With reference=peak, each county is "
            "shaded by its peak-season share instead: the three consecutive "
            "months with the highest heat share. Nothing is computed on request."
        ),
        success_responses={
            "200": (
                "Kenyan counties with display geometry and each county's published "
                "annual-average (or peak-season) share, or the reason it is absent."
            )
        },
    ),
    ("get", "/heat-outlook/{geography_id}/observed"): OperationDocumentation(
        summary="Score an observed month for a Kenyan place from ERA5",
        description=(
            "Scores one observed month for a Kenyan county (geo-ke-<county>), or "
            "the mean over Kenya's counties (geo-ke), with the modelling team's "
            "DLNM models, using the Copernicus ERA5 temperatures CHART has "
            "ingested. ERA5 is first moved onto the scale the models were fitted "
            "on by a fixed offset per county and calendar month. Low birth weight "
            "reads the birth month and the eight before it; under-five scores each "
            "day of the month on that day and the three before it and averages "
            "them. month (YYYY-MM) defaults to the newest month with complete "
            "inputs; selector is the pregnancy window or the age group. Requires a "
            "risk reader role and access to the geography path. The guides' "
            "display rules apply, so suppressed values arrive as null with the "
            "message to show in their place."
        ),
        success_responses={
            "200": (
                "The estimate with its 95% CI and ratio, the months that can be "
                "scored, the share for each of them, the temperatures used on both "
                "scales, and the notes the dashboard must display."
            )
        },
    ),
    ("get", "/heat-outlook/{geography_id}/observed/map"): OperationDocumentation(
        summary="Read Kenyan counties shaded by an observed month's heat share",
        description=(
            "Returns the counties of Kenya with their display geometry and each "
            "county's heat-attributable share for one observed month, scored as "
            "in the observed estimate. Requires a risk reader role and access to "
            "the geography path. Counties without complete ERA5 inputs carry "
            "missing_reason not_reported; suppressed shares carry no_excess."
        ),
        success_responses={
            "200": (
                "Kenyan counties with display geometry and each county's share for "
                "the observed month, or the reason it is absent."
            )
        },
    ),
    ("get", "/vra/indicators"): OperationDocumentation(
        summary="List the vulnerability and resilience indicator catalogue",
        description=(
            "Returns every indicator in the VRA catalogue with its component "
            "(hazard, exposure, sensitivity or adaptive capacity), unit, direction "
            "relative to risk (+1 more is worse, -1 more is better), how values "
            "arrive (computed, upload, manual or pull) and whether it is scored "
            "(included), shown as context, or dropped. Requires a risk reader role."
        ),
        success_responses={
            "200": (
                "The catalogue of VRA indicators with component, unit, direction, "
                "route, status and rationale."
            )
        },
    ),
    ("get", "/vra/{geography_id}/assessment"): OperationDocumentation(
        summary="Read the latest vulnerability assessment of a frame's areas",
        description=(
            "Returns the latest VRA run for the child areas of the geography "
            "(framed as the dashboard map frames them: a leaf is framed on its "
            "siblings), with each area's risk, class, rank, component scores, "
            "coverage and driving indicators. Scores are 0-1 and relative within "
            "the frame; missing scores are null with a reason, never zero. run is "
            "null until an administrator runs an assessment. Requires a risk "
            "reader role and access to the geography path."
        ),
        success_responses={
            "200": (
                "The frame, its latest run summary (or null) and every child area "
                "ranked by risk, unscored areas last."
            )
        },
    ),
    ("get", "/vra/{geography_id}/map"): OperationDocumentation(
        summary="Read a frame's areas shaded by vulnerability assessment risk",
        description=(
            "Returns the frame's child areas with display geometry in the risk "
            "map's shape, with value_percent set to the latest VRA risk score "
            "times 100. Areas scored without enough evidence carry missing_reason "
            "insufficient_data; areas no run has covered carry not_assessed. "
            "Requires a risk reader role and access to the geography path."
        ),
        success_responses={
            "200": (
                "The frame's areas with display geometry and VRA risk, or the "
                "reason the risk is absent."
            )
        },
    ),
    ("get", "/vra/{geography_id}/areas/{area_geography_id}"): OperationDocumentation(
        summary="Read one area's vulnerability scores and indicator evidence",
        description=(
            "Returns one child area of the frame with its assessment and, for "
            "every scored indicator in the catalogue, the raw value and vintage "
            "used, the normalised score, weight and contribution, the source and "
            "quality flags, and why it was excluded when it was (missing, "
            "no_data, too_few_areas, no_spread). Requires a risk reader role and "
            "access to the geography path."
        ),
        success_responses={
            "200": (
                "The area's assessment and the per-indicator raw values, scores "
                "and sources behind it."
            )
        },
    ),
    ("get", "/vra/{geography_id}/coverage"): OperationDocumentation(
        summary="Read VRA indicator coverage and upload history for a frame",
        description=(
            "For administrators: how many of the frame's child areas hold a value "
            "for each catalogue indicator, the vintages held and when they were "
            "last updated, plus the most recent uploads with their row-level "
            "rejections. Requires the chart_admin role and access to the "
            "geography path."
        ),
        success_responses={
            "200": (
                "Area count, per-indicator coverage and vintages, and recent "
                "ingestions with their rejections."
            )
        },
    ),
    ("get", "/vra/{geography_id}/template.csv"): OperationDocumentation(
        summary="Download the VRA value upload template for a frame",
        description=(
            "For administrators: a CSV with one blank row per child area and per "
            "indicator entered by upload or by hand, in the columns the upload "
            "accepts (area_code, area_name, indicator_code, value, vintage, "
            "source_name, source_url, notes). Requires the chart_admin role and "
            "access to the geography path."
        ),
        success_responses={
            "200": (
                "A text/csv template listing every child area and uploadable "
                "indicator with blank values."
            )
        },
    ),
    ("post", "/vra/{geography_id}/values"): OperationDocumentation(
        summary="Upload VRA indicator values for a frame's areas as CSV",
        description=(
            "For administrators: send the template columns as text/csv. Each row "
            "is checked (the area must be a child of the frame, the indicator must "
            "exist and be neither dropped nor computed, the value numeric and a "
            "percentage within 0-100, the vintage present); blank values are "
            "skipped. Valid rows are upserted on indicator, area and vintage. If "
            "no row is valid the upload is recorded as failed and nothing is "
            "written. Requires the chart_admin role and access to the geography."
        ),
        success_responses={
            "200": (
                "The ingestion id and status with accepted and rejected row counts "
                "and a reason for each rejected row."
            )
        },
    ),
    ("post", "/vra/{geography_id}/runs"): OperationDocumentation(
        summary="Run the vulnerability assessment for a frame's child areas",
        description=(
            "For administrators: recomputes the climate-derived hazard indicators "
            "from stored ERA5 months, scores every child area with method vra-v1 "
            "(5th-95th percentile min-max, equal weights, two-thirds coverage "
            "rule, geometric mean of hazard, exposure and vulnerability, quartile "
            "classes) and stores the run with its bounds and input and output "
            "hashes. Synchronous. Requires the chart_admin role and access to the "
            "geography path."
        ),
        success_responses={
            "200": (
                "The new assessment, in the same shape as the assessment read, "
                "with the stored run summary."
            )
        },
    ),
    ("get", "/model-settings"): OperationDocumentation(
        summary="Read model settings for the countries a user can see",
        description=(
            "Without parameters, lists the model settings of every country whose "
            "path the signed-in user can read, one item per outcome. With country "
            "(ISO code, e.g. KE) and outcome (e.g. lbw), returns that one item. "
            "Each item carries the options the published outlook tables and active "
            "model releases support, tagged by the view that uses them, and the "
            "effective settings: the stored ones, or the defaults when none are "
            "saved. Any signed-in user may read them; roles are not restricted yet."
        ),
        success_responses={
            "200": (
                "Available pregnancy windows or age groups, scenarios and data "
                "modes, with the options switched on and the defaults in use."
            )
        },
    ),
    ("put", "/model-settings/{country_code}/{outcome}"): OperationDocumentation(
        summary="Narrow the model options offered for a country and outcome",
        description=(
            "Stores which pregnancy windows or age groups, scenarios and data modes "
            "a country offers for an outcome. Settings may only narrow what the "
            "tables and releases support: unknown codes are refused "
            "(MODEL_SETTINGS_OPTION_UNKNOWN), every view keeps at least one option "
            "(MODEL_SETTINGS_OPTION_REQUIRED) and each default must be switched on "
            "(MODEL_SETTINGS_DEFAULT_NOT_ENABLED). Requires access to the country "
            "path; any signed-in role may write for now. Every change records a "
            "model_settings_changed audit event with the values before and after."
        ),
        success_responses={
            "200": (
                "The saved settings as they now apply, with the available options "
                "and who last changed them."
            )
        },
    ),
    ("get", "/risk/{geography_id}/monthly"): OperationDocumentation(
        summary="Read month-keyed ERA5 maximum temperature and attributable impacts",
        description=(
            "Returns the selected AppGeography's ERA5 maximum temperature in "
            "Celsius and persisted health impacts, keyed by YYYY-MM. An optional "
            "month query selects one calendar month, and an optional outcome "
            "selects which model's predictions to read. Requires a risk reader "
            "role and access to the exact geography path. The monthly value is "
            "the area-level mean of daily maximum temperature - the statistic the "
            "model consumes - never the month's single hottest day. "
            "Missing temperatures are null and missing impacts are empty arrays. "
            "Scenario and horizon are retained for each impact; no interpolation "
            "or model evaluation occurs. Fraction milli-units divide by ten for "
            "display as a percentage. Below the release's reference temperature "
            "the attributable fraction is zero: there is no heat to attribute."
        ),
        success_responses={
            "200": (
                "The linked admin unit and sorted monthly temperature/impact map; "
                "the map is empty when the geography has no matching data."
            )
        },
    ),
    ("get", "/risk/{geography_id}/short-term"): OperationDocumentation(
        summary="Read the Short-term dashboard series and horizon cards",
        description=(
            "Returns the precomputed heat-attributable series for the requested "
            "admin_unit under the seasonal ensemble and near-term projection "
            "scenarios, plus the three- and six-month horizon cards. Rows are "
            "produced upstream by the materialization bridge; the endpoint never "
            "runs an inference itself. Requires a bearer token and geography scope."
        ),
        success_responses={
            "200": (
                "The Short-term dashboard payload for the requested admin_unit "
                "including chart series and horizon cards."
            )
        },
    ),
    ("get", "/risk/{geography_id}/current-observation"): OperationDocumentation(
        summary="Read the latest observed climate reading for the place",
        description=(
            "Returns the most recent reanalysis-derived climate value for the "
            "admin_unit linked to the requested geography. The dashboard's "
            "Today strip renders this reading with its source name and month, "
            "so users can see the current conditions the forecast anchors on. "
            "Falls back to any observed variable when the canonical dashboard "
            "variable is not yet ingested. Requires a bearer token and "
            "geography scope."
        ),
        success_responses={
            "200": (
                "The latest observed reading plus its source and month, or a "
                "null-value payload when no observed climate rows exist yet."
            )
        },
    ),
    ("get", "/risk/{geography_id}/long-term"): OperationDocumentation(
        summary="Read the Long-term dashboard scenarios and horizon table",
        description=(
            "Returns three overlaid RCP scenarios and their 5- / 15- / 25-year "
            "horizon rows for the requested admin_unit under an SSP2 population "
            "baseline. Missing scenarios are omitted, so the client renders the "
            "scenarios that are available today. Requires a bearer token and "
            "geography scope."
        ),
        success_responses={
            "200": (
                "The Long-term dashboard payload for the requested admin_unit "
                "including per-scenario series and horizon tables."
            )
        },
    ),
    ("post", "/internal/bootstrap-place"): OperationDocumentation(
        summary="Seed one place's admin_units and register the model release",
        description=(
            "Onboarding calls this on setup completion. The service reads the "
            "boundary manifest, downloads the two GeoJSON files, walks the "
            "district-to-model-area crosswalk, upserts one AdminUnit per "
            "model area, and registers (or replaces) the ModelRelease + "
            "ActiveModelAssignment so the dashboard immediately reports "
            "supportsPrediction=true for those places. Idempotent - running "
            "twice with the same manifests is a no-op. Requires the internal "
            "service token from the CHART_INTERNAL_API_TOKEN environment "
            "variable."
        ),
        success_responses={
            "201": (
                "The place was seeded; response reports how many admin_units "
                "landed and which model release is now active for them."
            )
        },
    ),
    ("post", "/internal/erf-parameters"): OperationDocumentation(
        summary="Publish a fitted exposure-response curve for a geography",
        description=(
            "Records a fitted heat-health curve produced offline by the modeler in R. "
            "CHART never fits: publishing this row is the sole path for a new curve to "
            "become addressable by the projection pipeline. The endpoint is idempotent "
            "on (geography, outcome, git_ref) and requires the internal service token "
            "from the CHART_INTERNAL_API_TOKEN environment variable."
        ),
        success_responses={
            "201": (
                "The fitted curve was persisted; when the same git_ref was already "
                "on file the existing row is returned unchanged with created=false."
            )
        },
    ),
    ("post", "/climate/what-if"): OperationDocumentation(
        summary="Score one interactive what-if temperature against the LBW model",
        description=(
            "On-demand scorer that backs the dashboard's what-if slider. Resolves "
            "the caller's geography_id to its admin_unit and active model block, "
            "calls the R DLNM scorer with a flat three-month temperature profile at "
            "the requested Celsius value, and returns the odds ratio, 95% CI, "
            "positive-excess attributable fraction, signed relative-odds change, "
            "training-support flag, and the fitted block's temperature range. "
            "Stateless: nothing is persisted, so this "
            "path can handle high slider-drag volume without touching the durable "
            "prediction queue."
        ),
        success_responses={
            "200": (
                "The scored what-if response including odds ratio, CI, signed odds "
                "change, attributable fraction, support metadata, and the fitted "
                "block's temperature range."
            )
        },
    ),
    ("get", "/model-catalog"): OperationDocumentation(
        summary="List active model releases known to this installation",
        description=(
            "Returns each currently active ModelRelease with its climate hazard, "
            "health outcome, and covered admin_units so the planning UI can render "
            "hazard and outcome pickers straight from the registry instead of a "
            "client-side lookup table. Records reflect the ActiveModelAssignment "
            "state at the moment of the call."
        ),
        success_responses={
            "200": (
                "The active model releases with taxonomy fields and the admin_units "
                "each release is currently assigned to."
            )
        },
    ),
    ("get", "/model-releases"): OperationDocumentation(
        summary="List every registered model release",
        description=(
            "Returns every ModelRelease row (active-first) with identity, "
            "version, model_files (filename + SHA-256), area count, the "
            "manifest source path discovered on disk, S3 base URI, git ref, and "
            "activation timestamp. Requires a signed-in user because those "
            "fields are internal to the deployment. Powers the admin Models "
            "page under /settings, where operators inspect what is loaded and "
            "trigger reloads."
        ),
        success_responses={
            "200": (
                "The registered releases, each carrying an is_active flag plus "
                "manifest-source metadata for debugging."
            )
        },
    ),
    ("post", "/model-releases/{release_id}/reload"): OperationDocumentation(
        summary="Re-verify and re-warm one release into the R runtime",
        description=(
            "Finds the manifest whose id matches the URL parameter, re-parses "
            "its ModelReleaseSpec, and calls prepare_model_release to re-POST "
            "/models/load to the R runtime. Does not touch the database or "
            "reactivate the release. Requires the chart_admin role. Useful "
            "after an R container restart or after a manifest edit that swaps "
            "an artifact's SHA-256."
        ),
        success_responses={
            "200": (
                "The release id was found on disk and successfully warmed into "
                "the runtime; status is 'loaded'."
            )
        },
    ),
    ("post", "/model-releases/circuit/reset"): OperationDocumentation(
        summary="Clear the LBW inference circuit breaker in this API process",
        description=(
            "The R adapter's circuit breaker opens after "
            "INFERENCE_LBW_CIRCUIT_FAILURES consecutive failures (default 5) "
            "and stays open for INFERENCE_LBW_CIRCUIT_SECONDS (default 30). "
            "The half-open probe closes it automatically once R recovers, but "
            "an operator investigating after an outage can call this endpoint "
            "to skip the wait instead of restarting the API container. "
            "Requires the chart_admin role. Only "
            "clears state in the calling process; other API replicas keep "
            "their own counter until reset individually or until their next "
            "half-open probe succeeds."
        ),
        success_responses={
            "200": (
                "Circuit state cleared for this process; the next inference "
                "call will attempt R directly. Status is 'cleared'."
            )
        },
    ),
    ("post", "/audit/events"): OperationDocumentation(
        summary="Batch-insert one user's client-buffered activity events",
        description=(
            "Idempotent batch insert of user-action events emitted from the "
            "Activity buffer in the web client. Dedupe key is "
            "(session_id, flush_id, client_seq); retried batches drop duplicates "
            "silently. Each row is stamped with the current user id server-side, "
            "and the row is joined to prediction_request when present so the "
            "Activity drawer can surface run status alongside the click. "
            "Retention runs from chart-purge-audit-events (30-day rolling)."
        ),
        success_responses={
            "200": "The batch was applied; response reports the number of new rows persisted."
        },
    ),
    ("get", "/audit/events"): OperationDocumentation(
        summary="List the signed-in user's persisted activity events",
        description=(
            "Returns one page of the caller's own recorded activity events in "
            "newest-first order for the Activity drawer's durable history feed. "
            "Records referencing a prediction_request are hydrated with a compact "
            "run summary (status, planning_date, admin_unit_name). Users can only "
            "read their own events; there is no cross-user access."
        ),
        success_responses={
            "200": (
                "The user's recent events with any hydrated run summary and a "
                "next_before cursor for pagination."
            )
        },
    ),
    ("get", "/learning/resources"): OperationDocumentation(
        summary="Browse the curated Learning Hub resource catalogue",
        description=(
            "Returns the hand-picked shortlist by default; pass include=all for the "
            "whole catalogue. Results can be filtered by "
            "health outcome, track, kind, language, country, maximum length, and "
            "a free-text search over title, provider, objectives and tags. This "
            "catalogue is public so that practitioners can study the material "
            "before an installation grants them an account."
        ),
        success_responses={
            "200": (
                "The matching learning resources plus the unpaged total so the "
                "browser can show how many results a filter removed."
            )
        },
    ),
    ("get", "/learning/taxonomies"): OperationDocumentation(
        summary="List Learning Hub facet values and their counts",
        description=(
            "Derives the filter vocabulary from the published resources rather "
            "than storing it, so a reseed can never leave an orphaned facet "
            "behind. Each term carries its type, display label and the number of "
            "resources that currently carry it, which the filter chips show."
        ),
        success_responses={
            "200": ("Every derived facet term with its type, label and resource count.")
        },
    ),
    ("get", "/learning/tracks"): OperationDocumentation(
        summary="List the ordered Learning Hub pathway stops",
        description=(
            "Returns the curriculum tracks in the order a newcomer should meet "
            "them, from the basic climate-health link through to what CHART "
            "contributes to planning and funding. Each track reports how many "
            "published resources belong to it so the pathway can show progress."
        ),
        success_responses={
            "200": "The ordered pathway tracks with their resource counts."
        },
    ),
    ("get", "/learning/me"): OperationDocumentation(
        summary="Read the caller's Learning Hub pathway and picks",
        description=(
            "Returns the signed-in user's declared audience and track interests, "
            "their watch progress, per-track completion counts, the part-watched "
            "item worth resuming, and ranked recommendations. Each recommendation "
            "carries the reason it was chosen so the interface can explain itself."
        ),
        success_responses={
            "200": (
                "The caller's preferences, progress, pathway completion and "
                "ranked recommendations with their reasons."
            )
        },
    ),
    ("put", "/learning/me/preferences"): OperationDocumentation(
        summary="Set the caller's learning audience and interests",
        description=(
            "Stores the self-declared job the user is doing and the tracks they "
            "want to follow, used only to order recommendations. This is distinct "
            "from a Keycloak role, which governs permission; unknown track slugs "
            "are discarded rather than rejected."
        ),
        success_responses={
            "200": ("The refreshed personal view reflecting the saved preferences.")
        },
    ),
    ("put", "/learning/me/progress"): OperationDocumentation(
        summary="Record how far the caller watched one resource",
        description=(
            "Upserts a best-effort high-water mark for one resource, written when "
            "the player closes. Progress never moves backwards, and a resource is "
            "marked complete once most of its known duration has been watched or "
            "the caller says so explicitly."
        ),
        success_responses={
            "200": (
                "The stored watch position and whether the resource now counts as "
                "completed."
            )
        },
    ),
}


def build_openapi_schema(app: FastAPI) -> dict[str, Any]:
    """Build OpenAPI and require curated documentation for every operation."""

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    operations = {
        (method, path)
        for path, path_item in schema["paths"].items()
        for method in path_item
        if method in {"delete", "get", "head", "options", "patch", "post", "put"}
    }
    documented = set(OPERATION_DOCUMENTATION)
    if operations != documented:
        missing = sorted(operations - documented)
        obsolete = sorted(documented - operations)
        raise RuntimeError(
            "OpenAPI documentation catalog is out of sync: "
            f"missing={missing!r}, obsolete={obsolete!r}"
        )

    for (method, path), documentation in OPERATION_DOCUMENTATION.items():
        operation = schema["paths"][path][method]
        operation["summary"] = documentation.summary
        operation["description"] = documentation.description
        for status, description in documentation.success_responses.items():
            operation["responses"][status]["description"] = description

    return schema
