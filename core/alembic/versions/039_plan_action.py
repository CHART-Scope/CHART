"""add plan_action

Revision ID: 039_plan_action
Revises: 038_plan_district
Create Date: 2026-11-18

The actions a plan includes (Configure plan, step 4): the feed action with
its title, seasons and cost copied in, its rank, an owner department and a
due date.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "039_plan_action"
down_revision = "038_plan_district"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_action",
        sa.Column(
            "plan_id",
            sa.String(length=36),
            sa.ForeignKey("saved_plan.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("action_id", sa.String(length=64), primary_key=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("seasons", postgresql.JSONB(), nullable=False),
        sa.Column("cost_level", sa.String(length=64)),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column(
            "owner_department_id",
            sa.Integer(),
            sa.ForeignKey("department.id", ondelete="SET NULL"),
        ),
        sa.Column("due_date", sa.Date()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("plan_action")
