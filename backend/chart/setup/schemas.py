from __future__ import annotations

from pydantic import BaseModel, Field


class HazardOption(BaseModel):
    id: str
    label: str


class SetupCounts(BaseModel):
    geographies: int
    workspaceMembers: int


class SetupStatus(BaseModel):
    completed: bool
    requiresOnboarding: bool
    phase: str = "uninitialized"
    countryCode: str | None = None
    countryName: str | None = None
    rootGeographyId: str | None = None
    firstAdminUserId: str | None = None
    selectedHazards: list[HazardOption]
    counts: SetupCounts


class SetupOptions(BaseModel):
    hazards: list[HazardOption]


class SetupGeographyInput(BaseModel):
    id: str
    level: str
    levelLabel: str
    name: str
    parentId: str | None = None
    path: str
    sortOrder: int = 0


class CompleteSetupInput(BaseModel):
    countryCode: str = Field(min_length=2)
    countryName: str = Field(min_length=2)
    focusAreaIds: list[str] = Field(default_factory=list)
    geographies: list[SetupGeographyInput] = Field(default_factory=list)
    geographyLevelLabel: str = Field(min_length=2)
    hazardIds: list[str] = Field(min_length=1)
    healthAreaIds: list[str] = Field(default_factory=list)


class SetupAdminInput(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=3)
    username: str = Field(min_length=2)
    password: str = Field(min_length=8)


class BootstrapSetupInput(CompleteSetupInput):
    admin: SetupAdminInput


class BootstrapAdminResponse(BaseModel):
    userId: str
    username: str
    email: str


class BootstrapSetupResponse(BaseModel):
    setup: SetupStatus
    admin: BootstrapAdminResponse
