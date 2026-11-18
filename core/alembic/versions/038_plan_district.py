"""add plan_district

Revision ID: 038_plan_district
Revises: 037_plan_configuration
Create Date: 2026-11-18

The districts a plan focuses on (Configure plan, step 3), each with the rank
and share it had in the ranking the planner chose from.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "038_plan_district"
down_revision = "037_plan_configuration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_district",
        sa.Column(
            "plan_id",
            sa.String(length=36),
            sa.ForeignKey("saved_plan.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "geography_id",
            sa.String(length=128),
            sa.ForeignKey("geographies.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("rank", sa.Integer()),
        sa.Column("value_percent", sa.Float()),
        sa.Column("suggested", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source IN ('projection', 'observed')", name="ck_plan_district_source"
        ),
    )


def downgrade() -> None:
    op.drop_table("plan_district")
