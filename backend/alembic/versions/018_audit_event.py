"""add audit_event table

Revision ID: 018_audit_event
Revises: 017_recommended_actions
Create Date: 2026-08-03

Durable per-user action log. Rows arrive in batches from the frontend
Activity buffer (POST /audit/events) and back the top-bar Activity drawer.
30-day rolling retention runs from ``chart-purge-audit-events``.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "018_audit_event"
down_revision = "017_recommended_actions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_event",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("flush_id", sa.String(length=64), nullable=False),
        sa.Column("client_seq", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=48), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("geography_id", sa.String(length=128)),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "prediction_request_id",
            sa.Integer(),
            sa.ForeignKey("prediction_request.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "payload",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.UniqueConstraint(
            "session_id",
            "flush_id",
            "client_seq",
            name="uq_audit_event_client_dedupe",
        ),
    )
    op.create_index(
        "ix_audit_event_user_occurred",
        "audit_event",
        ["user_id", sa.text("occurred_at DESC")],
    )
    op.create_index(
        "ix_audit_event_received_at",
        "audit_event",
        ["received_at"],
    )
    op.create_index(
        "ix_audit_event_geography",
        "audit_event",
        ["geography_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_event_geography", table_name="audit_event")
    op.drop_index("ix_audit_event_received_at", table_name="audit_event")
    op.drop_index("ix_audit_event_user_occurred", table_name="audit_event")
    op.drop_table("audit_event")
