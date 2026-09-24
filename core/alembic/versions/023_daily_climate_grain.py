"""add the daily climate grain and day-grain input windows

Revision ID: 023_daily_climate_grain
Revises: 022_learning_featured
Create Date: 2026-09-18

The under-five association models are fitted on daily maximum temperature with
daily lags, but the only observation grain CHART stored was monthly. There was
no way to answer what those models were fitted to ask, so the batch path
refused them outright.

This adds the day grain beside the existing month grain rather than replacing
it: low birth weight stays monthly, because that is how it was fitted. A
climate run can now own both daily and monthly rows, so a day and the month
containing it trace back to the same ERA5 pull.

``climate_input_window`` gains the grain it records. Existing rows are all
month-grain, which is why the column backfills to "month" before being made
non-nullable.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "023_daily_climate_grain"
down_revision = "022_learning_featured"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "district_climate_day",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id"),
            nullable=False,
        ),
        sa.Column(
            "climate_run_id",
            sa.Integer(),
            sa.ForeignKey("climate_run.id"),
            nullable=False,
        ),
        sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("variable", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column(
            "agg_method",
            sa.String(length=64),
            nullable=False,
            server_default="bbox_mean",
        ),
        sa.Column("unit", sa.String(length=32)),
        sa.Column("quality_status", sa.String(length=32)),
        sa.Column("record_hash", sa.String(length=64)),
        sa.UniqueConstraint(
            "admin_unit_id",
            "climate_run_id",
            "period_date",
            "variable",
            name="uq_district_climate_day_grain",
        ),
    )
    op.create_index(
        "ix_district_climate_day_selection",
        "district_climate_day",
        ["admin_unit_id", "period_date", "variable"],
    )

    # Every window that exists today is month-grain; state that before the
    # column becomes required.
    op.add_column(
        "climate_input_window",
        sa.Column("grain", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "climate_input_window",
        sa.Column("target_end_date", sa.Date(), nullable=True),
    )
    op.execute("UPDATE climate_input_window SET grain = 'month' WHERE grain IS NULL")
    op.alter_column(
        "climate_input_window",
        "grain",
        existing_type=sa.String(length=16),
        nullable=False,
        server_default="month",
    )

    op.create_table(
        "climate_input_day",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "climate_input_window_id",
            sa.Integer(),
            sa.ForeignKey("climate_input_window.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "district_climate_day_id",
            sa.Integer(),
            sa.ForeignKey("district_climate_day.id"),
            nullable=False,
        ),
        sa.Column("lag_index", sa.Integer(), nullable=False),
        sa.UniqueConstraint(
            "climate_input_window_id",
            "lag_index",
            name="uq_climate_input_window_day_lag",
        ),
        sa.UniqueConstraint(
            "climate_input_window_id",
            "district_climate_day_id",
            name="uq_climate_input_window_day_value",
        ),
    )


def downgrade() -> None:
    op.drop_table("climate_input_day")
    op.drop_column("climate_input_window", "target_end_date")
    op.drop_column("climate_input_window", "grain")
    op.drop_index(
        "ix_district_climate_day_selection", table_name="district_climate_day"
    )
    op.drop_table("district_climate_day")
