"""add saved_plan table

Revision ID: 030_saved_plan
Revises: 029_configurable_geo_levels
Create Date: 2026-10-30

One row per dashboard view a user saved to plan from: the selections that
reopen it and the published estimate captured when it was saved.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "030_saved_plan"
down_revision = "029_configurable_geo_levels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_plan",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "geography_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "admin_unit_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
        ),
        sa.Column("outcome", sa.String(length=64), nullable=False),
        sa.Column("choices", postgresql.JSONB(), nullable=False),
        sa.Column("figure", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_saved_plan_user", "saved_plan", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_saved_plan_user", table_name="saved_plan")
    op.drop_table("saved_plan")
