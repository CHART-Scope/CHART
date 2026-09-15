"""preserve the migration chain after prediction_request.stage was added in 003

Revision ID: 004_prediction_request_stage
Revises: 003_prediction_requests
Create Date: 2026-07-16
"""

from __future__ import annotations

revision = "004_prediction_request_stage"
down_revision = "003_prediction_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
