"""reconcile legacy application tables with SQLAlchemy metadata

Revision ID: 015_reconcile_legacy_application_schema
Revises: 014_setup_sector_roles
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "015_reconcile_legacy_application_schema"
down_revision: str | None = "014_setup_sector_roles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


STRING_COLUMNS = {
    "country_geo_config": {
        "country_code": 8,
        "level_key": 32,
        "level_label": 64,
    },
    "geographies": {
        "id": 128,
        "country_code": 8,
        "level": 32,
        "level_label": 64,
        "name": 128,
        "parent_id": 128,
        "external_code": 128,
        "path": 512,
    },
    "setup_state": {
        "id": 64,
        "country_code": 8,
        "country_name": 128,
        "root_geography_id": 128,
        "first_admin_user_id": 128,
        "first_admin_email": 256,
        "primary_sector_id": 64,
    },
    "user_geography_scopes": {
        "id": 128,
        "user_id": 128,
        "geography_id": 128,
        "source": 64,
        "external_group_path": 512,
    },
    "user_roles": {
        "user_id": 128,
        "role": 64,
        "source": 64,
    },
    "users": {
        "id": 128,
        "username": 128,
        "email": 256,
        "phone": 64,
        "display_name": 256,
        "status": 32,
        "identity_provider": 64,
        "created_by_user_id": 128,
    },
    "workspace_members": {
        "id": 128,
        "workspace_id": 128,
        "user_id": 128,
        "role": 32,
    },
    "workspaces": {
        "id": 128,
        "name": 256,
        "planning_cycle": 64,
        "status": 32,
        "geography_id": 128,
        "created_by_user_id": 128,
        "owner_user_id": 128,
    },
}

UNIQUE_INDEXES = {
    "geographies": {
        "geographies_path_unique": ("path",),
    },
    "user_geography_scopes": {
        "user_geography_scopes_user_geo_source_unique": (
            "user_id",
            "geography_id",
            "source",
        ),
    },
    "users": {
        "users_username_unique": ("username",),
        "users_email_unique": ("email",),
    },
    "workspace_members": {
        "workspace_members_workspace_user_unique": (
            "workspace_id",
            "user_id",
        ),
    },
}

INDEXES = {
    "workspace_members": {
        "workspace_members_user_idx": ("user_id",),
    },
    "workspaces": {
        "workspaces_geography_idx": ("geography_id",),
        "workspaces_owner_user_idx": ("owner_user_id",),
    },
}


def upgrade() -> None:
    bind = op.get_bind()
    for table_name, columns in STRING_COLUMNS.items():
        actual = {
            column["name"]: column
            for column in sa.inspect(bind).get_columns(table_name)
        }
        for column_name, length in columns.items():
            column = actual[column_name]
            current_type = column["type"]
            if isinstance(current_type, sa.String) and current_type.length == length:
                continue
            too_long = bind.scalar(
                sa.text(
                    f'SELECT count(*) FROM "{table_name}" '
                    f'WHERE "{column_name}" IS NOT NULL '
                    f'AND length("{column_name}") > :limit'
                ),
                {"limit": length},
            )
            if too_long:
                raise RuntimeError(
                    "APPLICATION_SCHEMA_VALUE_TOO_LONG: "
                    f"{table_name}.{column_name} has {too_long} values over {length}"
                )
            op.alter_column(
                table_name,
                column_name,
                existing_type=current_type,
                type_=sa.String(length),
                existing_nullable=column["nullable"],
            )

    for column_name in ("selected_hazards", "collaborating_sector_ids"):
        column = next(
            column
            for column in sa.inspect(bind).get_columns("setup_state")
            if column["name"] == column_name
        )
        if isinstance(column["type"], postgresql.JSONB):
            continue
        op.alter_column(
            "setup_state",
            column_name,
            existing_type=column["type"],
            type_=postgresql.JSONB(),
            postgresql_using=f"{column_name}::jsonb",
            existing_nullable=False,
        )

    for table_name, indexes in UNIQUE_INDEXES.items():
        _replace_unique_constraints(table_name, indexes)
        _ensure_indexes(table_name, indexes, unique=True)
    for table_name, indexes in INDEXES.items():
        _ensure_indexes(table_name, indexes, unique=False)


def downgrade() -> None:
    # This migration adopts and safely narrows tables previously created by
    # Drizzle. Re-expanding them would reintroduce schema drift, so downgrade is
    # intentionally data-preserving and does not undo the reconciliation.
    pass


def _replace_unique_constraints(
    table_name: str,
    indexes: dict[str, tuple[str, ...]],
) -> None:
    inspector = sa.inspect(op.get_bind())
    targets = set(indexes.values())
    for constraint in inspector.get_unique_constraints(table_name):
        columns = tuple(constraint.get("column_names") or ())
        name = constraint.get("name")
        if name and columns in targets:
            op.drop_constraint(name, table_name, type_="unique")


def _ensure_indexes(
    table_name: str,
    indexes: dict[str, tuple[str, ...]],
    *,
    unique: bool,
) -> None:
    existing = {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }
    for name, columns in indexes.items():
        if name not in existing:
            op.create_index(name, table_name, list(columns), unique=unique)
