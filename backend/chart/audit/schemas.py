from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EventType = Literal[
    "signin",
    "signout",
    "page_view",
    "district_switch",
    "whatif_tick",
    "whatif_settled",
    "prediction_submitted",
    "prediction_completed",
    "prediction_failed",
]

MAX_EVENTS_PER_BATCH = 500


class AuditEventIn(BaseModel):
    """One event in a client flush batch."""

    model_config = ConfigDict(extra="forbid")

    client_seq: int = Field(ge=0)
    event_type: EventType
    occurred_at: datetime
    geography_id: str | None = None
    admin_unit_id: int | None = None
    prediction_request_id: int | None = None
    payload: dict = Field(default_factory=dict)


class AuditBatchIn(BaseModel):
    """One POST /audit/events body."""

    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1, max_length=64)
    flush_id: str = Field(min_length=1, max_length=64)
    events: list[AuditEventIn] = Field(min_length=1, max_length=MAX_EVENTS_PER_BATCH)


class AuditBatchAck(BaseModel):
    inserted: int


class AuditRunSummary(BaseModel):
    request_id: int
    status: str
    planning_date: str | None = None
    admin_unit_name: str | None = None


class AuditEventOut(BaseModel):
    id: int
    session_id: str
    flush_id: str
    client_seq: int
    event_type: EventType
    occurred_at: datetime
    received_at: datetime
    geography_id: str | None = None
    admin_unit_id: int | None = None
    prediction_request_id: int | None = None
    payload: dict
    run_summary: AuditRunSummary | None = None


class AuditListResponse(BaseModel):
    items: list[AuditEventOut]
    next_before: datetime | None = None
