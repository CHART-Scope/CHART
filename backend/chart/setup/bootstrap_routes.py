"""Internal HTTP endpoint the setup flow calls to seed a place.

Same guard as ``/internal/erf-parameters``: a static service token from
the ``CHART_INTERNAL_API_TOKEN`` environment variable. The onboarding
UI (via the trusted setup proxy) is the intended caller; end users
never see this route directly.
"""

from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from chart.shared.db.session import get_session_factory

from .place_bootstrap import (
    PlaceBootstrapError,
    PlaceBootstrapResult,
    bootstrap_place_from_manifest,
)

router = APIRouter(prefix="/internal", tags=["internal"])

_INTERNAL_TOKEN_ENV = "CHART_INTERNAL_API_TOKEN"
_bearer_scheme = HTTPBearer(auto_error=False, scheme_name="chart-internal-token")


def _expected_token() -> str | None:
    token = os.environ.get(_INTERNAL_TOKEN_ENV)
    if token is None or not token.strip():
        return None
    return token


def _authorize_service_call(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)
    ],
) -> None:
    expected = _expected_token()
    if expected is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="INTERNAL_API_NOT_CONFIGURED",
        )
    if credentials is None or not hmac.compare_digest(
        credentials.credentials, expected
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INTERNAL_TOKEN_INVALID",
        )


class BootstrapPlaceRequest(BaseModel):
    """Paths a caller provides so the platform never guesses.

    All three come from the model release's own bundle:
    ``pipelines/boundaries/manifests/*.json`` (boundary source URIs),
    ``pipelines/boundaries/data/*.csv`` (the district-to-model-area
    crosswalk), and ``pipelines/models/<outcome>/model-release.*.json``
    (the release the modeler shipped). Passing them explicitly keeps the
    service configuration-free and easy to point at other places later.
    """

    model_config = ConfigDict(extra="forbid")

    source_manifest_path: Path = Field(min_length=1)
    crosswalk_path: Path = Field(min_length=1)
    model_release_path: Path = Field(min_length=1)
    activate: bool = True


class BootstrapPlaceResponse(BaseModel):
    areas_seeded: int
    model_release_id: str
    model_status: str


@router.post(
    "/bootstrap-place",
    response_model=BootstrapPlaceResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {
            "description": (
                "Place already fully seeded from the same manifests; the "
                "existing admin_units and model release are returned unchanged."
            )
        },
        401: {"description": "Missing or wrong internal token."},
        404: {"description": "One of the required manifest paths does not exist."},
        502: {"description": "The boundary GeoJSON could not be downloaded."},
        503: {"description": "Internal API token not configured on this deployment."},
    },
)
def bootstrap_place(
    body: BootstrapPlaceRequest,
    _: Annotated[None, Depends(_authorize_service_call)],
) -> BootstrapPlaceResponse:
    for label, path in (
        ("source_manifest_path", body.source_manifest_path),
        ("crosswalk_path", body.crosswalk_path),
        ("model_release_path", body.model_release_path),
    ):
        if not path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"MANIFEST_PATH_NOT_FOUND:{label}",
            )

    with get_session_factory()() as session:
        try:
            result: PlaceBootstrapResult = bootstrap_place_from_manifest(
                session,
                source_manifest_path=body.source_manifest_path,
                crosswalk_path=body.crosswalk_path,
                model_release_path=body.model_release_path,
                activate=body.activate,
            )
        except PlaceBootstrapError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc
        session.commit()

    return BootstrapPlaceResponse(
        areas_seeded=result.areas_seeded,
        model_release_id=result.model_release_id,
        model_status=result.model_status,
    )
