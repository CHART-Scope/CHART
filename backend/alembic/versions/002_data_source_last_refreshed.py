"""add data_source.last_refreshed_at for cadence tracking

Revision ID: 002_data_source_last_refreshed
Revises: 001_climate_spine
Create Date: 2026-07-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "002_data_source_last_refreshed"
down_revision = "001_climate_spine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "data_source",
        sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("data_source", "last_refreshed_at")
