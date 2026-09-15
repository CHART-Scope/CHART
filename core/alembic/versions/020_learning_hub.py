"""add learning hub catalogue, pathway, and per-user state

Revision ID: 020_learning_hub
Revises: 019_model_release_taxonomy
Create Date: 2026-09-14

Creates the durable target for the curated Learning Hub reference list.
``learning_track`` holds the eight ordered pathway stops; ``learning_resource``
holds the catalogue itself, with ``tracks`` and ``tags`` as denormalised label
arrays so the facet vocabulary can be derived at read time rather than kept in
join tables (the same choice ``recommended_action`` makes).

``learning_progress`` and ``learning_preference`` are per-user state feeding
the "Continue watching" card and the ranking of recommendations. Both cascade
with the user row, because neither is meaningful once the account is gone.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "020_learning_hub"
down_revision = "019_model_release_taxonomy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learning_track",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("slug", name="uq_learning_track_slug"),
    )

    op.create_table(
        "learning_resource",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("canonical_url", sa.Text(), nullable=False),
        sa.Column("youtube_id", sa.String(length=32)),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="video"),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("provider", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("objectives", sa.Text(), nullable=False, server_default=""),
        sa.Column("audience_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "location_label", sa.String(length=256), nullable=False, server_default=""
        ),
        sa.Column(
            "countries",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "languages",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("duration_label", sa.String(length=64)),
        sa.Column(
            "format_label", sa.String(length=128), nullable=False, server_default=""
        ),
        sa.Column("published_on", sa.Date()),
        sa.Column("access_label", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "embed_status",
            sa.String(length=32),
            nullable=False,
            server_default="open_unverified",
        ),
        sa.Column(
            "tracks",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "tags",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("sort_weight", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "source", sa.String(length=32), nullable=False, server_default="seed"
        ),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("slug", name="uq_learning_resource_slug"),
    )
    op.create_index("ix_learning_resource_kind", "learning_resource", ["kind"])
    op.create_index(
        "ix_learning_resource_published",
        "learning_resource",
        ["is_published", "sort_weight"],
    )

    op.create_table(
        "learning_progress",
        sa.Column(
            "user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("learning_resource.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("seconds_watched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_learning_progress_user", "learning_progress", ["user_id", "last_seen_at"]
    )

    op.create_table(
        "learning_preference",
        sa.Column(
            "user_id",
            sa.String(length=128),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("audience_id", sa.String(length=64)),
        sa.Column(
            "interested_track_slugs",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("learning_preference")
    op.drop_index("ix_learning_progress_user", table_name="learning_progress")
    op.drop_table("learning_progress")
    op.drop_index("ix_learning_resource_published", table_name="learning_resource")
    op.drop_index("ix_learning_resource_kind", table_name="learning_resource")
    op.drop_table("learning_resource")
    op.drop_table("learning_track")
