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
            "availability rather than a hard-coded calendar."
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
