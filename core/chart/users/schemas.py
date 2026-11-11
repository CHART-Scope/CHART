from __future__ import annotations

from typing import Literal

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
    # Set when an invitation was just attempted (create or resend). The
    # account stands either way; a failed email can be sent again.
    invitation: Literal["sent", "failed"] | None = None


class CreateUserInput(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=3)
    phone: str | None = None
    username: str = Field(min_length=2)
    roles: list[str] = Field(min_length=1)
    geographyIds: list[str] = Field(min_length=1)
