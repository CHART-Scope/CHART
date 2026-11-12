"""HTTP endpoint answering whether the signed-in person may do one thing.

The person's grants and departments come with ``GET /auth/me``.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from .capabilities import MODULES
from .guards import principal_of
from .principal import AccessDenied, require
from .schemas import AccessCheck

router = APIRouter(tags=["access"])

CurrentUser = Annotated[CurrentUserContext, Depends(require_current_user)]
Module = Literal[MODULES]  # type: ignore[valid-type]
Level = Literal["read", "write", "manage"]


@router.get("/access/check", response_model=AccessCheck, summary="Check one capability")
def check_access(
    user: CurrentUser,
    module: Module,
    level: Level,
    place: Annotated[str, Query(max_length=512)],
    department: Annotated[list[int] | None, Query()] = None,
) -> AccessCheck:
    try:
        require(principal_of(user), module, level, place, set(department or []))
    except AccessDenied as exc:
        return AccessCheck(allowed=False, code=exc.code)
    return AccessCheck(allowed=True)
