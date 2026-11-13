"""drop the Keycloak-era access copies

Revision ID: 036_drop_token_access_tables
Revises: 035_access
Create Date: 2026-11-12

Every route now reads memberships, grants and departments (035). The copies
of Keycloak roles and groups (user_roles, user_geography_scopes), the
per-person departments from before workspaces (user_department), the old
workspace_members and workspaces.owner_user_id are dropped. A downgrade
recreates them empty.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "036_drop_token_access_tables"
down_revision = "035_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("user_department")
    op.drop_table("workspace_members")
    op.drop_table("user_geography_scopes")
    op.drop_table("user_roles")
    op.execute("DROP INDEX IF EXISTS workspaces_owner_user_idx")
    op.drop_column("workspaces", "owner_user_id")


def _user(name: str = "user_id") -> sa.Column:
    return sa.Column(
        name,
        sa.String(128),
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )


def _created() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def downgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column(
            "owner_user_id",
            sa.String(128),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
    )
    op.create_table(
        "user_roles",
        sa.Column(
            "user_id",
            sa.String(128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("role", sa.String(64), primary_key=True),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        _created(),
    )
    op.create_table(
        "user_geography_scopes",
        sa.Column("id", sa.String(128), primary_key=True),
        _user(),
        sa.Column(
            "geography_id",
            sa.String(128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column("external_group_path", sa.String(512)),
        _created(),
    )
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(128),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        _user(),
        sa.Column("role", sa.String(32), nullable=False),
        _created(),
    )
    op.create_table(
        "user_department",
        sa.Column(
            "user_id",
            sa.String(128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("department.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
