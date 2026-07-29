"""store installation sector and collaboration metadata

Revision ID: 014_setup_sector_roles
Revises: 013_systemic_safety
Create Date: 2026-07-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "014_setup_sector_roles"
down_revision: str | None = "013_systemic_safety"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("setup_state")
    }
    if "primary_sector_id" not in columns:
        op.add_column(
            "setup_state",
            sa.Column("primary_sector_id", sa.String(length=64)),
        )
    if "collaborating_sector_ids" not in columns:
        op.add_column(
            "setup_state",
            sa.Column(
                "collaborating_sector_ids",
                sa.JSON(),
                nullable=False,
                server_default="[]",
            ),
        )


def downgrade() -> None:
    columns = {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("setup_state")
    }
    if "collaborating_sector_ids" in columns:
        op.drop_column("setup_state", "collaborating_sector_ids")
    if "primary_sector_id" in columns:
        op.drop_column("setup_state", "primary_sector_id")
