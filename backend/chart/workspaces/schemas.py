from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CreateWorkspaceInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1)
    geography_id: str = Field(alias="geographyId", min_length=1)
    planning_cycle: str | None = Field(default=None, alias="planningCycle")


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    planning_cycle: str | None = Field(alias="planningCycle")
    status: str
    geography_id: str | None = Field(alias="geographyId")
    created_by_user_id: str | None = Field(alias="createdByUserId")
    owner_user_id: str | None = Field(alias="ownerUserId")
    member_role: str | None = Field(default=None, alias="memberRole")
