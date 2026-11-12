"""Disposable people for the live suites, set up as production does.

Keycloak only signs people in. Each planner is invited in CHART's database
(a role at a place in their country's workspace) and the invitation is
accepted at their first real sign-in. "denied" is never invited and holds
nothing. typography-admin is recorded as the platform admin, as setup does
for the administrator who runs it; so the seeded Keycloak `admin` (which
carries chart_admin) gains nothing, as it would once an installation has a
platform admin.
"""

from datetime import UTC, datetime, timedelta
import uuid

from sqlalchemy import select

from chart.access.workspaces import ensure_workspace
from chart.identity import find_account
from chart.shared.db.models import AccessRole, AppUser, Invitation, InvitationGrant
from chart.shared.db.session import get_session_factory

# (username, country, role key, geography id)
PEOPLE = (
    ("india-planner", "IN", "planning_lead", "geo-in"),
    ("kenya-planner", "KE", "planning_lead", "geo-ke"),
    (
        "district-planner",
        "IN",
        "planning_lead",
        "geo-in-madhya-pradesh-district-bhopal",
    ),
)


def main() -> None:
    admin = find_account("typography-admin")
    if admin is None:
        raise SystemExit("typography-admin is missing from the disposable realm")
    with get_session_factory()() as session:
        session.add(
            AppUser(
                id=admin.user_id,
                username=admin.username,
                email=admin.email,
                display_name="Typography admin",
                status="active",
                is_platform_admin=True,
            )
        )
        for username, country, role_key, geography_id in PEOPLE:
            workspace = ensure_workspace(session, country)
            role_id = session.scalar(
                select(AccessRole.id).where(
                    AccessRole.workspace_id == workspace.id, AccessRole.key == role_key
                )
            )
            invitation = Invitation(
                id=str(uuid.uuid4()),
                workspace_id=workspace.id,
                email=f"{username}@example.invalid",
                status="pending",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
            session.add(invitation)
            session.flush()
            session.add(
                InvitationGrant(
                    invitation_id=invitation.id,
                    geography_id=geography_id,
                    role_id=role_id,
                )
            )
        session.commit()
    print(f"Invited {len(PEOPLE)} planners; typography-admin is platform admin.")


if __name__ == "__main__":
    main()
