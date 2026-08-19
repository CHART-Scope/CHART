from __future__ import annotations

from pydantic import BaseModel, Field


class SectorOption(BaseModel):
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
    primarySectorId: str | None = None
    collaboratingSectorIds: list[str] = Field(default_factory=list)
    counts: SetupCounts


class ModelSyncResponse(BaseModel):
    activeReleaseIds: list[str]
    assignmentCount: int


class SetupOptions(BaseModel):
    sectors: list[SectorOption]
    geographies: list[SetupCountryOption] = Field(default_factory=list)


class SetupLevelOption(BaseModel):
    key: str
    label: str
    sortOrder: int = 0


class SetupModelMappingOption(BaseModel):
    releaseId: str
    outcome: str
    outcomeLabel: str
    modelAreaName: str
    modelScopeLabel: str


class SetupPlaceOption(BaseModel):
    placeCode: str
    id: str
    name: str
    level: str
    levelLabel: str
    parentPlaceCode: str | None = None
    path: str
    sortOrder: int
    predictionSupported: bool
    modelMappings: list[SetupModelMappingOption] = Field(default_factory=list)


class SetupCountryOption(BaseModel):
    countryCode: str
    countryName: str
    rootId: str
    rootPath: str
    levels: list[SetupLevelOption]
    places: list[SetupPlaceOption]


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
    primarySectorId: str = Field(min_length=1)
    collaboratingSectorIds: list[str] = Field(default_factory=list)
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
