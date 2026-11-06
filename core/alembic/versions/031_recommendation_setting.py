"""add recommendation_setting and saved_plan.insight

Revision ID: 031_recommendation_setting
Revises: 030_saved_plan
Create Date: 2026-10-30

Which ranker and insight provider/model the installation uses (no row means
the rules ranking and the template insight), and the insight last generated
for each saved plan so page views reuse it.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "031_recommendation_setting"
down_revision = "030_saved_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recommendation_setting",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ranker", sa.String(length=32), nullable=False),
        sa.Column("insight_provider", sa.String(length=32), nullable=False),
        sa.Column("insight_model", sa.String(length=200)),
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
    )
    op.add_column("saved_plan", sa.Column("insight", postgresql.JSONB()))


def downgrade() -> None:
    op.drop_column("saved_plan", "insight")
    op.drop_table("recommendation_setting")
