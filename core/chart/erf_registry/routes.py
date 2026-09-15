"""Internal HTTP endpoint for publishing a fitted ERF curve.

The route is not exposed under `/api/*` — it lives under `/internal/*`
and is protected by a static service token from the ``CHART_INTERNAL_API_TOKEN``
environment variable. Only the modeler's release automation should hold
this token; ordinary users cannot reach the endpoint.
"""

from __future__ import annotations

import hmac
import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from chart.shared.db.session import get_session_factory

from .schemas import ErfParametersPublished, ErfParametersSpec
from .service import GeographyNotFound, publish_erf_parameters

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


@router.post(
    "/erf-parameters",
    response_model=ErfParametersPublished,
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {"description": "Fitted curve already published; returned unchanged."},
        401: {"description": "Missing or wrong internal token."},
        404: {"description": "Geography slug does not exist."},
        503: {"description": "Internal API token not configured on this deployment."},
    },
)
def publish_erf_curve(
    spec: ErfParametersSpec,
    _: Annotated[None, Depends(_authorize_service_call)],
) -> ErfParametersPublished:
    with get_session_factory()() as session:
        try:
            outcome = publish_erf_parameters(session, spec)
        except GeographyNotFound as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="GEOGRAPHY_NOT_FOUND",
            ) from exc
        session.commit()
        session.refresh(outcome.row)

    return ErfParametersPublished(
        id=outcome.row.id,
        geography_slug=spec.geography_slug,
        outcome=spec.outcome,
        git_ref=spec.git_ref,
        reference_percentile=spec.reference_percentile,
        created=outcome.created,
    )
