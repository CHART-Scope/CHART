"""add the Configure plan wizard's fields to saved_plan

Revision ID: 037_plan_configuration
Revises: 036_drop_token_access_tables
Create Date: 2026-11-16

A plan made in the wizard is a draft until it is saved, runs between a start
and an end date, and addresses one hazard and one or more health outcomes.
Plans saved from the dashboard before this are kept as saved, with no dates,
under extreme heat (the only hazard any model covered) and their own outcome.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "037_plan_configuration"
down_revision = "036_drop_token_access_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "saved_plan",
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="saved"
        ),
    )
    op.add_column("saved_plan", sa.Column("start_date", sa.Date()))
    op.add_column("saved_plan", sa.Column("end_date", sa.Date()))
    op.add_column("saved_plan", sa.Column("hazard", sa.String(length=64)))
    op.add_column("saved_plan", sa.Column("outcomes", postgresql.JSONB()))
    op.add_column(
        "saved_plan",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.execute(
        "UPDATE saved_plan SET hazard = 'extreme_heat', "
        "outcomes = jsonb_build_array(outcome), updated_at = created_at"
    )
    op.alter_column("saved_plan", "hazard", nullable=False)
    op.alter_column("saved_plan", "outcomes", nullable=False)
    op.create_check_constraint(
        "ck_saved_plan_status", "saved_plan", "status IN ('draft', 'saved')"
    )
    op.create_check_constraint(
        "ck_saved_plan_timeline",
        "saved_plan",
        "(start_date IS NULL) = (end_date IS NULL) AND end_date >= start_date",
    )


def downgrade() -> None:
    op.drop_constraint("ck_saved_plan_timeline", "saved_plan", type_="check")
    op.drop_constraint("ck_saved_plan_status", "saved_plan", type_="check")
    for column in (
        "updated_at",
        "outcomes",
        "hazard",
        "end_date",
        "start_date",
        "status",
    ):
        op.drop_column("saved_plan", column)
