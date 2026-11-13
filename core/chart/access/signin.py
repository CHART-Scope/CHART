"""Linking a Keycloak sign-in to CHART: invitations, the first admin, visits.

Access is by invitation only. A sign-in creates a user row only when a
pending invitation names the verified email, or when it is the installation's
first administrator (the seeded Keycloak account with ``chart_admin``) and no
platform admin exists yet.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chart.shared.db.models import (
    AppUser,
    Invitation,
    InvitationDepartment,
    InvitationGrant,
    Membership,
    MembershipDepartment,
    MembershipGrant,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SignIn:
    user_id: str
    username: str
    email: str | None
    email_verified: bool
    display_name: str | None
    # The Keycloak role kept only to bootstrap the first platform admin.
    bootstrap_admin: bool = False


def link_sign_in(session: Session, sign_in: SignIn) -> None:
    """Link the sign-in. The web app's first page sends several requests at
    once, each linking the same new person: one wins, and the others, finding
    its rows on insert, read what it committed instead of failing."""

    try:
        _link(session, sign_in)
    except IntegrityError:
        session.rollback()
        logger.info("access: %s was linked by a concurrent request", sign_in.user_id)


def _link(session: Session, sign_in: SignIn) -> None:
    now = datetime.now(UTC)
    email = (sign_in.email or "").strip().lower() or None
    pending = _pending(session, email, now) if email and sign_in.email_verified else []
    first_admin = sign_in.bootstrap_admin and not session.scalar(
        select(func.count())
        .select_from(AppUser)
        .where(AppUser.is_platform_admin.is_(True), AppUser.status == "active")
    )
    user = session.get(AppUser, sign_in.user_id)
    if user is None:
        if not pending and not first_admin:
            return
        if email and session.scalar(
            select(AppUser.id).where(func.lower(AppUser.email) == email)
        ):
            # Another account already holds this email (a Keycloak user
            # recreated by hand); leave it to an administrator.
            logger.warning(
                "access: email of %s belongs to another user", sign_in.user_id
            )
            return
        user = AppUser(
            id=sign_in.user_id,
            username=sign_in.username,
            email=email,
            display_name=sign_in.display_name or sign_in.username,
            status="active",
        )
        session.add(user)
        session.flush()
    if first_admin:
        user.is_platform_admin = True
    if user.status == "active":
        for invitation in pending:
            accept(session, invitation, user.id, now)
    user.last_seen_at = now
    session.commit()


def accept(
    session: Session, invitation: Invitation, user_id: str, now: datetime
) -> Membership:
    """Give the invitation's grants and departments to the person."""

    membership = session.scalar(
        select(Membership).where(
            Membership.user_id == user_id,
            Membership.workspace_id == invitation.workspace_id,
        )
    )
    if membership is None:
        membership = Membership(
            user_id=user_id,
            workspace_id=invitation.workspace_id,
            status="active",
            invited_by_user_id=invitation.invited_by_user_id,
        )
        session.add(membership)
        session.flush()
    held = set(
        session.scalars(
            select(MembershipGrant.geography_id).where(
                MembershipGrant.membership_id == membership.id
            )
        )
    )
    for grant in session.scalars(
        select(InvitationGrant).where(InvitationGrant.invitation_id == invitation.id)
    ):
        if grant.geography_id not in held:
            session.add(
                MembershipGrant(
                    membership_id=membership.id,
                    role_id=grant.role_id,
                    geography_id=grant.geography_id,
                )
            )
    in_departments = set(
        session.scalars(
            select(MembershipDepartment.department_id).where(
                MembershipDepartment.membership_id == membership.id
            )
        )
    )
    for department_id in session.scalars(
        select(InvitationDepartment.department_id).where(
            InvitationDepartment.invitation_id == invitation.id
        )
    ):
        if department_id not in in_departments:
            session.add(
                MembershipDepartment(
                    membership_id=membership.id, department_id=department_id
                )
            )
    invitation.status = "accepted"
    invitation.accepted_at = now
    invitation.user_id = user_id
    session.flush()
    return membership


def _pending(session: Session, email: str, now: datetime) -> list[Invitation]:
    rows = session.scalars(
        select(Invitation).where(
            func.lower(Invitation.email) == email, Invitation.status == "pending"
        )
    ).all()
    live = []
    for invitation in rows:
        if _aware(invitation.expires_at) <= now:
            invitation.status = "expired"
        else:
            live.append(invitation)
    return live


def _aware(value: datetime) -> datetime:
    # SQLite test stores hand back naive datetimes.
    return value if value.tzinfo else value.replace(tzinfo=UTC)
