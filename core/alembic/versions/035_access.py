"""workspaces, roles, grants and invitations

Revision ID: 035_access
Revises: 034_department
Create Date: 2026-11-12

Moves what people may do from Keycloak roles and groups into CHART
(docs/access-control.md): one workspace per country, roles as capability
levels per module, memberships with grants (a role at a place) and
departments, department ownership of data sources and VRA indicator groups,
and invitations. Backfills from user_roles, user_geography_scopes and
user_department; those tables stay until every route reads the new ones.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "035_access"
down_revision = "034_department"
branch_labels = None
depends_on = None

# Frozen copy of chart.access.capabilities at this revision, so later edits
# to the defaults never change what this migration did.
_MODULES = (
    "risk",
    "data",
    "vra",
    "actions",
    "plans",
    "seasons",
    "people",
    "departments",
    "workspace",
)
_READ = {module: "read" for module in _MODULES if module != "workspace"}
_ROLES = {
    "workspace_admin": ("Workspace admin", {m: "manage" for m in _MODULES}),
    "planning_lead": (
        "Planning lead",
        {
            **_READ,
            "risk": "write",
            "actions": "manage",
            "plans": "write",
            "people": "write",
            "departments": "write",
        },
    ),
    "implementation_officer": (
        "Implementation officer",
        {**_READ, "actions": "write", "plans": "write"},
    ),
    "data_officer": ("Data officer", {**_READ, "data": "write", "vra": "write"}),
    "viewer": ("Viewer", dict(_READ)),
}
_DEPARTMENTS = (
    "Health",
    "Climate change",
    "Environment",
    "Water",
    "Disaster management",
    "Urban development",
    "Labour",
)
# Keycloak role → new role, highest first; sector moves to departments.
_ROLE_MAP = (
    ("chart_admin", "workspace_admin"),
    ("health_planning_lead", "planning_lead"),
    ("cross_sector_planning_lead", "planning_lead"),
    ("health_implementation_officer", "implementation_officer"),
    ("cross_sector_implementation_officer", "implementation_officer"),
    ("content_editor", "viewer"),
    ("public_viewer", "viewer"),
)
_HEALTH_ROLES = {"health_planning_lead", "health_implementation_officer"}


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def _user_fk(name: str, ondelete: str, nullable: bool = True) -> sa.Column:
    return sa.Column(
        name,
        sa.String(length=128),
        sa.ForeignKey("users.id", ondelete=ondelete),
        nullable=nullable,
    )


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_platform_admin",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column("workspaces", sa.Column("country_code", sa.String(length=8)))
    op.create_index(
        "workspaces_country_unique", "workspaces", ["country_code"], unique=True
    )
    op.add_column(
        "department",
        sa.Column(
            "workspace_id",
            sa.String(length=128),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
        ),
    )
    op.add_column("department", sa.Column("archived_at", sa.DateTime(timezone=True)))
    op.create_table(
        "access_role",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(length=128),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        _created_at(),
    )
    op.create_index(
        "access_role_workspace_key_unique",
        "access_role",
        ["workspace_id", "key"],
        unique=True,
    )
    op.create_table(
        "access_role_capability",
        sa.Column(
            "role_id",
            sa.Integer(),
            sa.ForeignKey("access_role.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("module", sa.String(length=32), primary_key=True),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.CheckConstraint(
            "level IN ('read', 'write', 'manage')", name="ck_access_role_level"
        ),
    )
    op.create_table(
        "membership",
        sa.Column("id", sa.Integer(), primary_key=True),
        _user_fk("user_id", "CASCADE", nullable=False),
        sa.Column(
            "workspace_id",
            sa.String(length=128),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=16), nullable=False),
        _user_fk("invited_by_user_id", "SET NULL"),
        _created_at(),
        sa.CheckConstraint(
            "status IN ('active', 'disabled')", name="ck_membership_status"
        ),
    )
    op.create_index(
        "membership_user_workspace_unique",
        "membership",
        ["user_id", "workspace_id"],
        unique=True,
    )
    op.create_table(
        "membership_grant",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "membership_id",
            sa.Integer(),
            sa.ForeignKey("membership.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role_id",
            sa.Integer(),
            sa.ForeignKey("access_role.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "geography_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_index(
        "membership_grant_place_unique",
        "membership_grant",
        ["membership_id", "geography_id"],
        unique=True,
    )
    op.create_table(
        "membership_department",
        sa.Column(
            "membership_id",
            sa.Integer(),
            sa.ForeignKey("membership.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("department.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_table(
        "department_ownership",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("department.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("resource_kind", sa.String(length=32), nullable=False),
        sa.Column("resource_key", sa.String(length=128), nullable=False),
        sa.CheckConstraint(
            "resource_kind IN ('data_source', 'vra_indicator_group')",
            name="ck_department_ownership_kind",
        ),
    )
    op.create_index(
        "department_ownership_unique",
        "department_ownership",
        ["department_id", "resource_kind", "resource_key"],
        unique=True,
    )
    op.create_index(
        "department_ownership_resource_idx",
        "department_ownership",
        ["resource_kind", "resource_key"],
    )
    op.create_table(
        "invitation",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(length=128),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(length=256), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        _user_fk("invited_by_user_id", "SET NULL"),
        _user_fk("user_id", "SET NULL"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        _created_at(),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'revoked', 'expired')",
            name="ck_invitation_status",
        ),
    )
    op.create_index(
        "invitation_workspace_email_idx", "invitation", ["workspace_id", "email"]
    )
    op.create_table(
        "invitation_grant",
        sa.Column(
            "invitation_id",
            sa.String(length=36),
            sa.ForeignKey("invitation.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "geography_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "role_id",
            sa.Integer(),
            sa.ForeignKey("access_role.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_table(
        "invitation_department",
        sa.Column(
            "invitation_id",
            sa.String(length=36),
            sa.ForeignKey("invitation.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("department.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    _backfill(op.get_bind())


def _backfill(bind) -> None:
    q = lambda sql, **params: bind.execute(sa.text(sql), params)  # noqa: E731

    countries = {
        row.country_code: row
        for row in q(
            "SELECT id, country_code, name FROM geographies WHERE level = 'country'"
        )
    }
    scopes = q(
        "SELECT s.user_id, g.id AS geography_id, g.country_code"
        " FROM user_geography_scopes s JOIN geographies g ON g.id = s.geography_id"
    ).all()
    roles: dict[str, set[str]] = {}
    for row in q("SELECT user_id, role FROM user_roles"):
        roles.setdefault(row.user_id, set()).add(row.role)
    wanted = (
        {row.country_code for row in scopes}
        | {
            row.country_code
            for row in q("SELECT DISTINCT country_code FROM department")
        }
    ) & set(countries)

    # One workspace per country: a country's existing (setup) workspace is
    # claimed first, otherwise one is created.
    workspace_of: dict[str, str] = {}
    for row in q(
        "SELECT w.id, g.country_code FROM workspaces w"
        " JOIN geographies g ON g.id = w.geography_id ORDER BY w.created_at"
    ):
        if row.country_code in countries and row.country_code not in workspace_of:
            workspace_of[row.country_code] = row.id
            q(
                "UPDATE workspaces SET country_code = :code WHERE id = :id",
                code=row.country_code,
                id=row.id,
            )
    for code in sorted(wanted - set(workspace_of)):
        country = countries[code]
        workspace_id = f"workspace-{code.lower()}"
        q(
            "INSERT INTO workspaces (id, name, status, geography_id, country_code)"
            " VALUES (:id, :name, 'active', :geo, :code)",
            id=workspace_id,
            name=country.name,
            geo=country.id,
            code=code,
        )
        workspace_of[code] = workspace_id

    role_id: dict[tuple[str, str], int] = {}
    for code, workspace_id in workspace_of.items():
        for key, (name, levels) in _ROLES.items():
            new_id = q(
                "INSERT INTO access_role (workspace_id, key, name, is_default)"
                " VALUES (:ws, :key, :name, true) RETURNING id",
                ws=workspace_id,
                key=key,
                name=name,
            ).scalar_one()
            role_id[(code, key)] = new_id
            for module, level in levels.items():
                q(
                    "INSERT INTO access_role_capability (role_id, module, level)"
                    " VALUES (:role, :module, :level)",
                    role=new_id,
                    module=module,
                    level=level,
                )
        q(
            "UPDATE department SET workspace_id = :ws WHERE country_code = :code",
            ws=workspace_id,
            code=code,
        )
        if not q(
            "SELECT 1 FROM department WHERE country_code = :code LIMIT 1", code=code
        ).first():
            for name in _DEPARTMENTS:
                q(
                    "INSERT INTO department (country_code, workspace_id, name)"
                    " VALUES (:code, :ws, :name)",
                    code=code,
                    ws=workspace_id,
                    name=name,
                )

    admins = [user for user, held in roles.items() if "chart_admin" in held]
    if admins:
        bind.execute(
            sa.text(
                "UPDATE users SET is_platform_admin = true WHERE id IN :ids"
            ).bindparams(sa.bindparam("ids", expanding=True)),
            {"ids": admins},
        )

    membership_of: dict[tuple[str, str], int] = {}

    def membership(user_id: str, code: str) -> int:
        if (user_id, code) not in membership_of:
            membership_of[(user_id, code)] = q(
                "INSERT INTO membership (user_id, workspace_id, status)"
                " VALUES (:user, :ws, 'active') RETURNING id",
                user=user_id,
                ws=workspace_of[code],
            ).scalar_one()
        return membership_of[(user_id, code)]

    for row in scopes:
        if row.country_code not in workspace_of:
            continue
        held = roles.get(row.user_id, set())
        key = next((new for old, new in _ROLE_MAP if old in held), "viewer")
        # Administrators were widened to their whole country.
        place = (
            countries[row.country_code].id
            if key == "workspace_admin"
            else row.geography_id
        )
        q(
            "INSERT INTO membership_grant (membership_id, role_id, geography_id)"
            " VALUES (:m, :role, :geo) ON CONFLICT DO NOTHING",
            m=membership(row.user_id, row.country_code),
            role=role_id[(row.country_code, key)],
            geo=place,
        )

    for row in q(
        "SELECT ud.user_id, d.id AS department_id, d.country_code"
        " FROM user_department ud JOIN department d ON d.id = ud.department_id"
    ):
        if (row.user_id, row.country_code) in membership_of:
            q(
                "INSERT INTO membership_department (membership_id, department_id)"
                " VALUES (:m, :d) ON CONFLICT DO NOTHING",
                m=membership_of[(row.user_id, row.country_code)],
                d=row.department_id,
            )
    # Health leads and officers keep their sector as the Health department.
    for (user_id, code), membership_id in membership_of.items():
        if roles.get(user_id, set()) & _HEALTH_ROLES:
            q(
                "INSERT INTO membership_department (membership_id, department_id)"
                " SELECT :m, id FROM department"
                " WHERE workspace_id = :ws AND lower(name) = 'health'"
                " ON CONFLICT DO NOTHING",
                m=membership_id,
                ws=workspace_of[code],
            )


def downgrade() -> None:
    for table in (
        "invitation_department",
        "invitation_grant",
        "invitation",
        "department_ownership",
        "membership_department",
        "membership_grant",
        "membership",
        "access_role_capability",
        "access_role",
    ):
        op.drop_table(table)
    op.drop_column("department", "archived_at")
    op.drop_column("department", "workspace_id")
    op.drop_index("workspaces_country_unique", table_name="workspaces")
    op.drop_column("workspaces", "country_code")
    op.drop_column("users", "is_platform_admin")
