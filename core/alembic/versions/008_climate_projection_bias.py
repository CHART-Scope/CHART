"""preserve projection bias adjustment metadata

Revision ID: 008_climate_projection_bias
Revises: 007_python_application_tables
Create Date: 2026-07-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "008_climate_projection_bias"
down_revision = "007_python_application_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("climate_run")}
    if "bias_adjustment" not in columns:
        op.add_column(
            "climate_run",
            sa.Column("bias_adjustment", sa.String(length=128), nullable=True),
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("climate_run")}
    if "bias_adjustment" in columns:
        op.drop_column("climate_run", "bias_adjustment")
