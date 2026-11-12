"""Members of a workspace and invitations to join one.

People with ``people:read`` see the members whose grants overlap their own
places; ``people:write`` invites within one's places; ``people:manage``
changes a member's grants and departments or disables them. Nobody grants
more than they hold at a place.
"""

from __future__ import annotations

import logging
import uuid
from typing import Literal, cast
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from chart.access.capabilities import RANK
from chart.access.guards import principal_of
from chart.access.principal import forget, level_at, normalize
from chart.access.signin import accept
from chart.auth.schemas import CurrentUserContext
from chart.identity import IdentityError, ensure_account, send_invitation, sign_out
from chart.shared.db.models import (
    AccessRole,
    AppGeography,
    AppUser,
    Department,
    Invitation,
    InvitationDepartment,
    InvitationGrant,
    Membership,
    MembershipDepartment,
    MembershipGrant,
)

from .departments import add_named_departments, workspace_departments
from .schemas import (
    DepartmentRef,
    GrantInput,
    GrantItem,
    InvitationCreate,
    InvitationItem,
    InvitationList,
    MemberItem,
    MemberList,
    MemberUpdate,
)
from .service import WorkspaceError, audit, role_levels, workspace_for

logger = logging.getLogger(__name__)

INVITATION_DAYS = 7
InvitationStatus = Literal["pending", "accepted", "revoked", "expired"]


def list_members(
    session: Session, user: CurrentUserContext, workspace_id: str
) -> MemberList:
    workspace, _root = workspace_for(session, user, workspace_id)
    memberships = session.execute(
        select(Membership, AppUser)
        .join(AppUser, AppUser.id == Membership.user_id)
        .where(Membership.workspace_id == workspace.id)
    ).all()
    grants = _grants(session, [membership.id for membership, _ in memberships])
    departments = _departments(
        session, [membership.id for membership, _ in memberships]
    )
    items = []
    for membership, person in memberships:
        theirs = grants.get(membership.id, [])
        if not any(_sees(user, grant.place_path) for grant in theirs):
            continue
        items.append(
            MemberItem(
                user_id=person.id,
                display_name=person.display_name,
                email=person.email,
                status=(
                    "active"
                    if membership.status == "active" and person.status == "active"
                    else "disabled"
                ),
                grants=theirs,
                departments=departments.get(membership.id, []),
                last_seen_at=person.last_seen_at,
                can_manage=person.id != user.user_id
                and all(_holds(user, "people", "manage", g.place_path) for g in theirs),
            )
        )
    items.sort(key=lambda item: item.display_name.lower())
    return MemberList(items=items)


def update_member(
    session: Session,
    user: CurrentUserContext,
    workspace_id: str,
    member_id: str,
    update: MemberUpdate,
) -> MemberItem:
    workspace, root = workspace_for(session, user, workspace_id)
    membership = _membership(session, workspace.id, member_id)
    if member_id == user.user_id and not principal_of(user).is_platform_admin:
        raise WorkspaceError("MEMBER_SELF_EDIT", 409)
    current = _grants(session, [membership.id]).get(membership.id, [])
    for grant in current:
        _need(user, "people", "manage", grant.place_path)
    wanted = _checked_grants(session, user, workspace.id, root, update.grants, "manage")
    department_ids = _checked_departments(session, workspace.id, update.department_ids)
    session.execute(
        delete(MembershipGrant).where(MembershipGrant.membership_id == membership.id)
    )
    session.add_all(
        MembershipGrant(
            membership_id=membership.id, role_id=role_id, geography_id=geography_id
        )
        for geography_id, role_id in wanted.items()
    )
    session.execute(
        delete(MembershipDepartment).where(
            MembershipDepartment.membership_id == membership.id
        )
    )
    session.add_all(
        MembershipDepartment(membership_id=membership.id, department_id=id_)
        for id_ in sorted(department_ids)
    )
    audit(
        session,
        user,
        "membership_changed",
        {
            "workspace_id": workspace.id,
            "user_id": member_id,
            "before": [[g.role_key, g.geography_id] for g in current],
            "after": [[role_id, geo] for geo, role_id in wanted.items()],
        },
    )
    session.commit()
    forget(member_id)
    return _member(session, user, workspace.id, member_id)


def set_member_status(
    session: Session,
    user: CurrentUserContext,
    workspace_id: str,
    member_id: str,
    active: bool,
) -> MemberItem:
    workspace, _root = workspace_for(session, user, workspace_id)
    membership = _membership(session, workspace.id, member_id)
    if member_id == user.user_id:
        raise WorkspaceError("MEMBER_SELF_EDIT", 409)
    for grant in _grants(session, [membership.id]).get(membership.id, []):
        _need(user, "people", "manage", grant.place_path)
    membership.status = "active" if active else "disabled"
    audit(
        session,
        user,
        "membership_enabled" if active else "membership_disabled",
        {"workspace_id": workspace.id, "user_id": member_id},
    )
    session.commit()
    forget(member_id)
    if not active and not _still_active(session, member_id):
        # Nothing left to open: end their sessions so no new token is issued.
        try:
            sign_out(member_id)
        except IdentityError:
            logger.warning("people: could not sign out %s in Keycloak", member_id)
    return _member(session, user, workspace.id, member_id)


def list_invitations(
    session: Session, user: CurrentUserContext, workspace_id: str
) -> InvitationList:
    workspace, _root = workspace_for(session, user, workspace_id)
    _expire(session, workspace.id)
    rows = session.scalars(
        select(Invitation)
        .where(Invitation.workspace_id == workspace.id)
        .order_by(Invitation.created_at.desc())
        .limit(200)
    ).all()
    items = [_invitation(session, row) for row in rows]
    return InvitationList(
        items=[
            item
            for item in items
            if any(_sees(user, grant.place_path) for grant in item.grants)
        ]
    )


def invite(
    session: Session,
    user: CurrentUserContext,
    workspace_id: str,
    request: InvitationCreate,
) -> InvitationItem:
    workspace, root = workspace_for(session, user, workspace_id)
    email = request.email.strip().lower()
    grants = _checked_grants(session, user, workspace.id, root, request.grants, "write")
    department_ids = _checked_departments(session, workspace.id, request.department_ids)
    if request.new_departments:
        department_ids |= add_named_departments(
            session, user, workspace.id, request.new_departments
        )
    if session.scalar(
        select(Invitation.id).where(
            Invitation.workspace_id == workspace.id,
            func.lower(Invitation.email) == email,
            Invitation.status == "pending",
        )
    ):
        raise WorkspaceError("INVITATION_PENDING", 409)
    existing = session.scalar(select(AppUser).where(func.lower(AppUser.email) == email))
    if existing is not None and session.scalar(
        select(Membership.id).where(
            Membership.workspace_id == workspace.id, Membership.user_id == existing.id
        )
    ):
        raise WorkspaceError("MEMBER_EXISTS", 409)
    now = datetime.now(UTC)
    invitation = Invitation(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        email=email,
        status="pending",
        invited_by_user_id=user.user_id,
        expires_at=now + timedelta(days=INVITATION_DAYS),
    )
    session.add(invitation)
    session.flush()
    session.add_all(
        InvitationGrant(invitation_id=invitation.id, geography_id=geo, role_id=role)
        for geo, role in grants.items()
    )
    session.add_all(
        InvitationDepartment(invitation_id=invitation.id, department_id=id_)
        for id_ in sorted(department_ids)
    )
    session.flush()
    audit(
        session,
        user,
        "invitation_created",
        {"workspace_id": workspace.id, "invitation_id": invitation.id, "email": email},
    )
    email_sent: bool | None = None
    if existing is not None and existing.status == "active":
        # Already signed up elsewhere: the access applies at once.
        accept(session, invitation, existing.id, now)
        session.commit()
        forget(existing.id)
    else:
        session.commit()
        email_sent = _send(request.name.strip(), email)
    item = _invitation(session, invitation)
    item.email_sent = email_sent
    return item


def resend_invitation(
    session: Session, user: CurrentUserContext, workspace_id: str, invitation_id: str
) -> InvitationItem:
    invitation = _pending_invitation(session, user, workspace_id, invitation_id)
    invitation.expires_at = datetime.now(UTC) + timedelta(days=INVITATION_DAYS)
    invitation.status = "pending"
    session.commit()
    item = _invitation(session, invitation)
    item.email_sent = _send(invitation.email, invitation.email)
    return item


def revoke_invitation(
    session: Session, user: CurrentUserContext, workspace_id: str, invitation_id: str
) -> InvitationItem:
    invitation = _pending_invitation(session, user, workspace_id, invitation_id)
    if invitation.status != "pending":
        raise WorkspaceError("INVITATION_NOT_PENDING", 409)
    invitation.status = "revoked"
    audit(
        session,
        user,
        "invitation_revoked",
        {"workspace_id": workspace_id, "invitation_id": invitation.id},
    )
    session.commit()
    return _invitation(session, invitation)


def _pending_invitation(
    session: Session, user: CurrentUserContext, workspace_id: str, invitation_id: str
) -> Invitation:
    workspace, _root = workspace_for(session, user, workspace_id)
    _expire(session, workspace.id)
    invitation = session.get(Invitation, invitation_id)
    if invitation is None or invitation.workspace_id != workspace.id:
        raise WorkspaceError("INVITATION_NOT_FOUND", 404)
    if invitation.status not in {"pending", "expired"}:
        raise WorkspaceError("INVITATION_NOT_PENDING", 409)
    for grant in _invitation(session, invitation).grants:
        _need(user, "people", "write", grant.place_path)
    return invitation


def _send(name: str, email: str) -> bool:
    try:
        account = ensure_account(name=name, email=email)
        send_invitation(account.user_id)
    except IdentityError as error:
        logger.warning("people: invitation email to %s failed: %s", email, error.code)
        return False
    return True


def _checked_grants(
    session: Session,
    user: CurrentUserContext,
    workspace_id: str,
    root: str,
    grants: list[GrantInput],
    level: str,
) -> dict[str, int]:
    """Grants inside the workspace, at places the caller holds ``level`` on
    people, with roles no higher than the caller holds there."""

    principal = principal_of(user)
    result: dict[str, int] = {}
    for grant in grants:
        place = session.get(AppGeography, grant.geography_id)
        role = session.get(AccessRole, grant.role_id)
        if place is None or not _within(normalize(place.path), root):
            raise WorkspaceError("GRANT_PLACE_INVALID", 422)
        if role is None or role.workspace_id != workspace_id:
            raise WorkspaceError("GRANT_ROLE_INVALID", 422)
        if grant.geography_id in result:
            raise WorkspaceError("GRANT_PLACE_DUPLICATE", 422)
        path = normalize(place.path)
        _need(user, "people", level, path)
        if not principal.is_platform_admin:
            for module, wanted in role_levels(session, role.id).items():
                held = level_at(principal, module, path)
                if held is None or RANK[held] < RANK[wanted]:
                    raise WorkspaceError("GRANT_EXCEEDS_YOUR_ACCESS", 403)
        result[grant.geography_id] = role.id
    return result


def _checked_departments(
    session: Session, workspace_id: str, department_ids: list[int]
) -> set[int]:
    available = {row.id for row in workspace_departments(session, workspace_id)}
    wanted = set(department_ids)
    if not wanted <= available:
        raise WorkspaceError("DEPARTMENT_UNKNOWN", 422)
    return wanted


def _membership(session: Session, workspace_id: str, user_id: str) -> Membership:
    membership = session.scalar(
        select(Membership).where(
            Membership.workspace_id == workspace_id, Membership.user_id == user_id
        )
    )
    if membership is None:
        raise WorkspaceError("MEMBER_NOT_FOUND", 404)
    return membership


def _member(
    session: Session, user: CurrentUserContext, workspace_id: str, member_id: str
) -> MemberItem:
    for item in list_members(session, user, workspace_id).items:
        if item.user_id == member_id:
            return item
    raise WorkspaceError("MEMBER_NOT_FOUND", 404)


def _grants(session: Session, membership_ids: list[int]) -> dict[int, list[GrantItem]]:
    result: dict[int, list[GrantItem]] = {}
    for grant, role, place in session.execute(
        select(MembershipGrant, AccessRole, AppGeography)
        .join(AccessRole, AccessRole.id == MembershipGrant.role_id)
        .join(AppGeography, AppGeography.id == MembershipGrant.geography_id)
        .where(MembershipGrant.membership_id.in_(membership_ids))
        .order_by(AppGeography.path)
    ):
        result.setdefault(grant.membership_id, []).append(_grant_item(role, place))
    return result


def _departments(
    session: Session, membership_ids: list[int]
) -> dict[int, list[DepartmentRef]]:
    result: dict[int, list[DepartmentRef]] = {}
    for membership_id, department in session.execute(
        select(MembershipDepartment.membership_id, Department)
        .join(Department, Department.id == MembershipDepartment.department_id)
        .where(MembershipDepartment.membership_id.in_(membership_ids))
        .order_by(func.lower(Department.name))
    ):
        result.setdefault(membership_id, []).append(
            DepartmentRef(id=department.id, name=department.name)
        )
    return result


def _invitation(session: Session, invitation: Invitation) -> InvitationItem:
    grants = [
        _grant_item(role, place)
        for _, role, place in session.execute(
            select(InvitationGrant, AccessRole, AppGeography)
            .join(AccessRole, AccessRole.id == InvitationGrant.role_id)
            .join(AppGeography, AppGeography.id == InvitationGrant.geography_id)
            .where(InvitationGrant.invitation_id == invitation.id)
            .order_by(AppGeography.path)
        )
    ]
    departments = [
        DepartmentRef(id=department.id, name=department.name)
        for department in session.scalars(
            select(Department)
            .join(
                InvitationDepartment,
                InvitationDepartment.department_id == Department.id,
            )
            .where(InvitationDepartment.invitation_id == invitation.id)
            .order_by(func.lower(Department.name))
        )
    ]
    inviter = (
        session.get(AppUser, invitation.invited_by_user_id)
        if invitation.invited_by_user_id
        else None
    )
    return InvitationItem(
        id=invitation.id,
        email=invitation.email,
        status=cast(InvitationStatus, invitation.status),
        grants=grants,
        departments=departments,
        invited_by=inviter.display_name if inviter else None,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
    )


def _grant_item(role: AccessRole, place: AppGeography) -> GrantItem:
    return GrantItem(
        role_id=role.id,
        role_key=role.key,
        role_name=role.name,
        geography_id=place.id,
        place_name=place.name,
        place_path=normalize(place.path),
    )


def _expire(session: Session, workspace_id: str) -> None:
    now = datetime.now(UTC)
    changed = False
    for invitation in session.scalars(
        select(Invitation).where(
            Invitation.workspace_id == workspace_id, Invitation.status == "pending"
        )
    ):
        expires = invitation.expires_at
        if (expires if expires.tzinfo else expires.replace(tzinfo=UTC)) <= now:
            invitation.status = "expired"
            changed = True
    if changed:
        session.commit()


def _still_active(session: Session, user_id: str) -> bool:
    person = session.get(AppUser, user_id)
    if person is not None and person.is_platform_admin:
        return True
    return bool(
        session.scalar(
            select(Membership.id).where(
                Membership.user_id == user_id, Membership.status == "active"
            )
        )
    )


def _sees(user: CurrentUserContext, place: str) -> bool:
    """A member is visible when their grant overlaps a place where the caller
    reads people: at or below it, or above it (their own manager)."""

    principal = principal_of(user)
    if principal.is_platform_admin:
        return True
    for workspace in principal.workspaces:
        for grant in workspace.grants:
            if grant.levels.get("people") and (
                _within(place, grant.path) or _within(grant.path, place)
            ):
                return True
    return False


def _holds(user: CurrentUserContext, module: str, level: str, place: str) -> bool:
    held = level_at(principal_of(user), module, place)
    return held is not None and RANK[held] >= RANK[level]


def _need(user: CurrentUserContext, module: str, level: str, place: str) -> None:
    if not _holds(user, module, level, place):
        raise WorkspaceError("CAPABILITY_NOT_ALLOWED", 403)


def _within(place: str, scope: str) -> bool:
    return scope == "/" or place == scope or place.startswith(f"{scope}/")
