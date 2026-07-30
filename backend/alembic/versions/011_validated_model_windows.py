"""record validated model windows per geography

Revision ID: 011_validated_model_windows
Revises: 010_waiting_planning_requests
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "011_validated_model_windows"
down_revision: str | None = "010_waiting_planning_requests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "model_area_mapping",
        sa.Column(
            "validated_pregnancy_windows",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[1, 2, 3]'::json"),
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE model_area_mapping
            SET validated_pregnancy_windows = '[1]'::json
            WHERE model_area_key = 'Madhya Pradesh'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE prediction_request AS request
            SET request_payload = jsonb_set(
                request.request_payload::jsonb,
                '{pregnancy_windows}',
                '[1]'::jsonb,
                true
            )::json
            FROM model_area_mapping AS mapping
            WHERE request.admin_unit_id = mapping.admin_unit_id
              AND mapping.model_area_key = 'Madhya Pradesh'
              AND request.status IN ('waiting', 'queued')
            """
        )
    )
    op.alter_column(
        "model_area_mapping",
        "validated_pregnancy_windows",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("model_area_mapping", "validated_pregnancy_windows")
