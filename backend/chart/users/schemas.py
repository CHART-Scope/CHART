from __future__ import annotations

from pydantic import BaseModel, Field


class UserGeographyScope(BaseModel):
    geographyId: str
    path: str
    name: str
    levelLabel: str


class UserResponse(BaseModel):
    userId: str
    username: str
    email: str | None = None
    phone: str | None = None
    displayName: str
    status: str
    roles: list[str]
    geographyScopes: list[UserGeographyScope]


class CreateUserInput(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=3)
    phone: str | None = None
    username: str = Field(min_length=2)
    password: str = Field(min_length=8)
    roles: list[str] = Field(min_length=1)
    geographyIds: list[str] = Field(min_length=1)
