"""add department and user_department

Revision ID: 034_department
Revises: 033_heat_season_setting
Create Date: 2026-11-11

The departments taking part in planning per country (Settings > Workspace),
which any planner may add to, and the departments each person works in.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "034_department"
down_revision = "033_heat_season_setting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "department",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("country_code", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "department_country_name_unique",
        "department",
        ["country_code", "name"],
        unique=True,
    )
    op.create_table(
        "user_department",
        sa.Column(
            "user_id",
            sa.String(length=128),
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


def downgrade() -> None:
    op.drop_table("user_department")
    op.drop_index("department_country_name_unique", table_name="department")
    op.drop_table("department")
