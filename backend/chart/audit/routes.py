from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user

from .schemas import AuditBatchAck, AuditBatchIn, AuditListResponse
from .service import insert_events, list_events

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/events", response_model=AuditBatchAck)
def post_events(
    batch: AuditBatchIn,
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
) -> AuditBatchAck:
    inserted = insert_events(user_id=user.user_id, batch=batch)
    return AuditBatchAck(inserted=inserted)


@router.get("/events", response_model=AuditListResponse)
def get_events(
    user: Annotated[CurrentUserContext, Depends(require_current_user)],
    limit: int = Query(100, ge=1, le=500),
    before: datetime | None = Query(None),
) -> AuditListResponse:
    if limit > 500:
        raise HTTPException(status_code=400, detail="LIMIT_TOO_LARGE")
    return list_events(user_id=user.user_id, limit=limit, before=before)
