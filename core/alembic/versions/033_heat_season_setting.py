"""add heat_season_setting

Revision ID: 033_heat_season_setting
Revises: 032_drop_recommended_action
Create Date: 2026-11-11

Each place's heat-season calendar (before, during and after months), set in
Settings > Heat seasons. Child places without a row inherit their parent's.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "033_heat_season_setting"
down_revision = "032_drop_recommended_action"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "heat_season_setting",
        sa.Column(
            "geography_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("months", sa.String(length=12), nullable=False),
        sa.Column("source", sa.String(length=200)),
        sa.Column(
            "updated_by_user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("months ~ '^[bdao]{12}$'", name="ck_heat_season_months"),
    )


def downgrade() -> None:
    op.drop_table("heat_season_setting")
