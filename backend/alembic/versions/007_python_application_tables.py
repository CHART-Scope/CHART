"""move CHART application tables into the Python migration chain

Revision ID: 007_python_application_tables
Revises: 006_prediction_data_spine
Create Date: 2026-07-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "007_python_application_tables"
down_revision = "006_prediction_data_spine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not _has("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.String(128), primary_key=True),
            sa.Column("username", sa.String(128), nullable=False, unique=True),
            sa.Column("email", sa.String(256), unique=True),
            sa.Column("phone", sa.String(64)),
            sa.Column("display_name", sa.String(256), nullable=False),
            sa.Column("status", sa.String(32), nullable=False, server_default="active"),
            sa.Column(
                "identity_provider",
                sa.String(64),
                nullable=False,
                server_default="keycloak",
            ),
            sa.Column("created_by_user_id", sa.String(128)),
            sa.Column(
                "first_seen_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("last_seen_at", sa.DateTime(timezone=True)),
            *_timestamps(),
            sa.ForeignKeyConstraint(
                ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
        )
        op.create_index("users_status_idx", "users", ["status"])

    if not _has("user_roles"):
        op.create_table(
            "user_roles",
            sa.Column(
                "user_id",
                sa.String(128),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("role", sa.String(64), primary_key=True),
            sa.Column(
                "source", sa.String(64), nullable=False, server_default="keycloak"
            ),
            sa.Column(
                "synced_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index("user_roles_role_idx", "user_roles", ["role"])

    if not _has("user_geography_scopes"):
        op.create_table(
            "user_geography_scopes",
            sa.Column("id", sa.String(128), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(128),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "geography_id",
                sa.String(128),
                sa.ForeignKey("geographies.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "source", sa.String(64), nullable=False, server_default="keycloak"
            ),
            sa.Column("external_group_path", sa.String(512)),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "user_id",
                "geography_id",
                "source",
                name="user_geography_scopes_user_geo_source_unique",
            ),
        )
        op.create_index(
            "user_geography_scopes_user_idx", "user_geography_scopes", ["user_id"]
        )

    if not _has("workspaces"):
        op.create_table(
            "workspaces",
            sa.Column("id", sa.String(128), primary_key=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("planning_cycle", sa.String(64)),
            sa.Column("status", sa.String(32), nullable=False, server_default="active"),
            sa.Column(
                "geography_id",
                sa.String(128),
                sa.ForeignKey("geographies.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "created_by_user_id",
                sa.String(128),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "owner_user_id",
                sa.String(128),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            *_timestamps(),
        )

    if not _has("workspace_members"):
        op.create_table(
            "workspace_members",
            sa.Column("id", sa.String(128), primary_key=True),
            sa.Column(
                "workspace_id",
                sa.String(128),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.String(128),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role", sa.String(32), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "workspace_id",
                "user_id",
                name="workspace_members_workspace_user_unique",
            ),
        )

    if not _has("setup_state"):
        op.create_table(
            "setup_state",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column(
                "completed", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
            sa.Column("country_code", sa.String(8)),
            sa.Column("country_name", sa.String(128)),
            sa.Column(
                "root_geography_id",
                sa.String(128),
                sa.ForeignKey("geographies.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "first_admin_user_id",
                sa.String(128),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            sa.Column("first_admin_email", sa.String(256)),
            sa.Column(
                "selected_hazards", sa.JSON(), nullable=False, server_default="[]"
            ),
            *_timestamps(),
        )

    _validate_application_schema()


def downgrade() -> None:
    # These tables contain user and workspace data and may have been created by
    # the retired API, so an Alembic downgrade intentionally keeps them.
    pass


def _has(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _validate_application_schema() -> None:
    """Fail migration immediately when a retired-API table has drifted.

    Merely finding a table name is not enough to adopt it into Alembic. These
    are the columns and keys the Python services require for safe ownership.
    """

    expected = {
        "users": {
            "columns": {
                "id",
                "username",
                "email",
                "phone",
                "display_name",
                "status",
                "identity_provider",
                "created_by_user_id",
                "first_seen_at",
                "last_seen_at",
                "created_at",
                "updated_at",
            },
            "primary_key": {"id"},
            "unique": {frozenset({"username"}), frozenset({"email"})},
        },
        "user_roles": {
            "columns": {"user_id", "role", "source", "synced_at", "created_at"},
            "primary_key": {"user_id", "role"},
            "unique": set(),
        },
        "user_geography_scopes": {
            "columns": {
                "id",
                "user_id",
                "geography_id",
                "source",
                "external_group_path",
                "created_at",
            },
            "primary_key": {"id"},
            "unique": {
                frozenset({"user_id", "geography_id", "source"}),
            },
        },
        "workspaces": {
            "columns": {
                "id",
                "name",
                "planning_cycle",
                "status",
                "geography_id",
                "created_by_user_id",
                "owner_user_id",
                "created_at",
                "updated_at",
            },
            "primary_key": {"id"},
            "unique": set(),
        },
        "workspace_members": {
            "columns": {
                "id",
                "workspace_id",
                "user_id",
                "role",
                "created_at",
            },
            "primary_key": {"id"},
            "unique": {frozenset({"workspace_id", "user_id"})},
        },
        "setup_state": {
            "columns": {
                "id",
                "completed",
                "country_code",
                "country_name",
                "root_geography_id",
                "first_admin_user_id",
                "first_admin_email",
                "selected_hazards",
                "created_at",
                "updated_at",
            },
            "primary_key": {"id"},
            "unique": set(),
        },
    }
    inspector = sa.inspect(op.get_bind())
    for table_name, contract in expected.items():
        actual_columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }
        missing = contract["columns"] - actual_columns
        if missing:
            raise RuntimeError(
                f"APPLICATION_SCHEMA_INCOMPATIBLE: {table_name} missing "
                f"{sorted(missing)}"
            )
        primary_key = set(
            inspector.get_pk_constraint(table_name).get("constrained_columns", [])
        )
        if primary_key != contract["primary_key"]:
            raise RuntimeError(
                f"APPLICATION_SCHEMA_INCOMPATIBLE: {table_name} primary key "
                f"{sorted(primary_key)}"
            )
        unique_sets = {
            frozenset(item.get("column_names") or [])
            for item in inspector.get_unique_constraints(table_name)
        }
        unique_sets.update(
            frozenset(item.get("column_names") or [])
            for item in inspector.get_indexes(table_name)
            if item.get("unique")
        )
        missing_unique = contract["unique"] - unique_sets
        if missing_unique:
            raise RuntimeError(
                f"APPLICATION_SCHEMA_INCOMPATIBLE: {table_name} missing unique "
                f"constraints {sorted(map(sorted, missing_unique))}"
            )


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
