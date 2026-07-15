from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CurrentUserContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    username: str
    email: str | None = None
    roles: list[str]
    geography_scopes: list[str] = Field(alias="geographyScopes")
    active_geography_id: str | None = Field(default=None, alias="activeGeographyId")
    geography_level: str | None = Field(default=None, alias="geographyLevel")


class GeographyAccessResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    can_access: bool = Field(alias="canAccess")
    geography_path: str = Field(alias="geographyPath")
    user_id: str = Field(alias="userId")


class AuthErrorResponse(BaseModel):
    error: str
