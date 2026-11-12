from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ResourceKind = Literal["data_source", "vra_indicator_group"]


class WorkspaceItem(BaseModel):
    id: str
    country_code: str
    name: str
    geography_id: str | None
    place_path: str | None
    member_count: int


class WorkspaceList(BaseModel):
    items: list[WorkspaceItem]


class WorkspaceCreate(BaseModel):
    country_code: str = Field(pattern=r"^[A-Za-z]{2}$")


class RoleItem(BaseModel):
    id: int
    key: str
    name: str
    is_default: bool
    capabilities: dict[str, str]


class RoleList(BaseModel):
    modules: list[str]
    items: list[RoleItem]


class GrantInput(BaseModel):
    role_id: int
    geography_id: str = Field(min_length=1, max_length=128)


class GrantItem(BaseModel):
    role_id: int
    role_key: str
    role_name: str
    geography_id: str
    place_name: str
    place_path: str


class DepartmentRef(BaseModel):
    id: int
    name: str


class MemberItem(BaseModel):
    user_id: str
    display_name: str
    email: str | None
    status: Literal["active", "disabled"]
    grants: list[GrantItem]
    departments: list[DepartmentRef]
    last_seen_at: datetime | None
    #: Whether the caller may change this member's grants or disable them.
    can_manage: bool


class MemberList(BaseModel):
    items: list[MemberItem]


class MemberUpdate(BaseModel):
    grants: list[GrantInput] = Field(min_length=1, max_length=20)
    department_ids: list[int] = Field(default_factory=list, max_length=50)


class InvitationCreate(BaseModel):
    email: str = Field(
        min_length=3, max_length=256, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    )
    name: str = Field(min_length=1, max_length=256)
    grants: list[GrantInput] = Field(min_length=1, max_length=20)
    department_ids: list[int] = Field(default_factory=list, max_length=50)
    #: Departments to add to the workspace and put the person in.
    new_departments: list[str] = Field(default_factory=list, max_length=10)


class InvitationItem(BaseModel):
    id: str
    email: str
    status: Literal["pending", "accepted", "revoked", "expired"]
    grants: list[GrantItem]
    departments: list[DepartmentRef]
    invited_by: str | None
    expires_at: datetime
    created_at: datetime
    #: Whether the invitation email went out on this request.
    email_sent: bool | None = None


class InvitationList(BaseModel):
    items: list[InvitationItem]


class ResourceRef(BaseModel):
    kind: ResourceKind
    key: str = Field(min_length=1, max_length=128)


class DepartmentItem(BaseModel):
    id: int
    name: str
    archived: bool
    member_count: int
    owns: list[ResourceRef]


class DepartmentList(BaseModel):
    items: list[DepartmentItem]
    #: The caller's own departments in this workspace.
    mine: list[int]


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    archived: bool | None = None


class MyDepartments(BaseModel):
    department_ids: list[int] = Field(max_length=50)


class Ownership(BaseModel):
    resources: list[ResourceRef] = Field(max_length=100)


class ResourceOption(BaseModel):
    kind: ResourceKind
    key: str
    name: str


class ResourceOptions(BaseModel):
    items: list[ResourceOption]
