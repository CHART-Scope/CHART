"""add waiting planning requests

Revision ID: 010_waiting_planning_requests
Revises: 009_prediction_request_history
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "010_waiting_planning_requests"
down_revision: str | None = "009_prediction_request_history"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "prediction_request",
        sa.Column("available_from", sa.Date(), nullable=True),
    )
    op.create_index(
        "ix_prediction_request_waiting_available",
        "prediction_request",
        ["status", "available_from"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_prediction_request_waiting_available",
        table_name="prediction_request",
    )
    op.drop_column("prediction_request", "available_from")
