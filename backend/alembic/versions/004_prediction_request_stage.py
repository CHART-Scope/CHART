"""add prediction_request.stage for async workflow tracking

Revision ID: 004_prediction_request_stage
Revises: 003_prediction_requests
Create Date: 2026-07-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "004_prediction_request_stage"
down_revision = "003_prediction_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prediction_request",
        sa.Column(
            "stage",
            sa.String(length=32),
            nullable=False,
            server_default="queued",
        ),
    )


def downgrade() -> None:
    op.drop_column("prediction_request", "stage")
