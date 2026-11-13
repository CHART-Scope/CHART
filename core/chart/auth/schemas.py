from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GrantSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    geography_id: str = Field(alias="geographyId")
    place_path: str = Field(alias="placePath")
    place_name: str = Field(alias="placeName")
    role_key: str = Field(alias="roleKey")
    role_name: str = Field(alias="roleName")
    # Level (read, write, manage) per module.
    capabilities: dict[str, str]


class DepartmentSummary(BaseModel):
    id: int
    name: str


class WorkspaceSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    workspace_id: str = Field(alias="workspaceId")
    country_code: str = Field(alias="countryCode")
    name: str
    grants: list[GrantSummary]
    departments: list[DepartmentSummary]


class CurrentUserContext(BaseModel):
    """The signed-in person: who Keycloak says they are, and what CHART's
    database says they may do (``access``, never serialised)."""

    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    username: str
    email: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    status: str = "active"
    is_platform_admin: bool = Field(default=False, alias="isPlatformAdmin")
    geography_scopes: list[str] = Field(default_factory=list, alias="geographyScopes")
    active_geography_id: str | None = Field(default=None, alias="activeGeographyId")
    geography_level: str | None = Field(default=None, alias="geographyLevel")
    workspaces: list[WorkspaceSummary] = Field(default_factory=list)
    access: Any = Field(default=None, exclude=True)


class GeographyAccessResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    can_access: bool = Field(alias="canAccess")
    geography_path: str = Field(alias="geographyPath")
    user_id: str = Field(alias="userId")


class AuthErrorResponse(BaseModel):
    error: str
