"""index prediction history by user and place

Revision ID: 009_prediction_request_history
Revises: 008_climate_projection_bias
Create Date: 2026-07-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "009_prediction_request_history"
down_revision = "008_climate_projection_bias"
branch_labels = None
depends_on = None

index_name = "ix_prediction_request_user_location_created"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    indexes = {index["name"] for index in inspector.get_indexes("prediction_request")}
    if index_name not in indexes:
        op.create_index(
            index_name,
            "prediction_request",
            ["requested_by_user_id", "location_slug", "created_at"],
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    indexes = {index["name"] for index in inspector.get_indexes("prediction_request")}
    if index_name in indexes:
        op.drop_index(index_name, table_name="prediction_request")
