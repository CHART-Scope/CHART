"""HTTP endpoints for per-country model settings.

Any signed-in user who can read the country may read and change them; roles
are intentionally not restricted yet. Every change is audit-logged.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from .schemas import (
    ModelSettingsListResponse,
    ModelSettingsResponse,
    ModelSettingsValues,
)
from .service import ModelSettingsError, get_settings, list_settings, update_settings

router = APIRouter(prefix="/model-settings", tags=["model-settings"])

CountryCode = Annotated[str, Path(pattern=r"^[A-Za-z]{2}$")]
Outcome = Annotated[str, Path(min_length=1, max_length=64)]


@router.get(
    "",
    response_model=ModelSettingsListResponse | ModelSettingsResponse,
    summary="Read the model settings for countries the user can see",
)
def read_model_settings(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    country: Annotated[str | None, Query(pattern=r"^[A-Za-z]{2}$")] = None,
    outcome: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> ModelSettingsListResponse | ModelSettingsResponse:
    try:
        if country is not None and outcome is not None:
            return get_settings(user, country, outcome)
        if country is not None or outcome is not None:
            raise HTTPException(
                status_code=422, detail="MODEL_SETTINGS_COUNTRY_AND_OUTCOME_REQUIRED"
            )
        return list_settings(user)
    except ModelSettingsError as error:
        raise HTTPException(status_code=error.status_code, detail=error.code) from error


@router.put(
    "/{country_code}/{outcome}",
    response_model=ModelSettingsResponse,
    summary="Narrow the model options offered for a country and outcome",
)
def write_model_settings(
    country_code: CountryCode,
    outcome: Outcome,
    values: ModelSettingsValues,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> ModelSettingsResponse:
    try:
        return update_settings(user, country_code, outcome, values)
    except ModelSettingsError as error:
        raise HTTPException(status_code=error.status_code, detail=error.code) from error
