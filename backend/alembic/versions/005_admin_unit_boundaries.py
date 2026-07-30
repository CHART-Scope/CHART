"""store versioned administrative polygons on the geographic spine

Revision ID: 005_admin_unit_boundaries
Revises: 004_prediction_request_stage
Create Date: 2026-07-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision = "005_admin_unit_boundaries"
down_revision = "004_prediction_request_stage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Revisions 001-004 originally used `geography`, which conflicts with the
    # PostGIS type of the same name. Fresh databases already use the corrected
    # table name; databases that applied the older revisions still need the
    # one-time rename before PostGIS can be enabled.
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    has_legacy_table = "geography" in tables
    has_current_table = "chart_geographies" in tables
    if has_legacy_table and has_current_table:
        raise RuntimeError(
            "MIGRATION_GEOGRAPHY_TABLE_AMBIGUOUS: both geography tables exist"
        )
    if has_legacy_table:
        op.rename_table("geography", "chart_geographies")
    elif not has_current_table:
        raise RuntimeError("MIGRATION_GEOGRAPHY_TABLE_MISSING")

    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.add_column(
        "admin_unit",
        sa.Column(
            "boundary",
            Geometry("MULTIPOLYGON", srid=4326, spatial_index=False),
            nullable=True,
        ),
    )
    op.add_column(
        "admin_unit", sa.Column("boundary_provenance", sa.JSON(), nullable=True)
    )
    op.create_index(
        "ix_admin_unit_boundary_gist",
        "admin_unit",
        ["boundary"],
        unique=False,
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("ix_admin_unit_boundary_gist", table_name="admin_unit")
    op.drop_column("admin_unit", "boundary_provenance")
    op.drop_column("admin_unit", "boundary")
    # PostGIS is shared infrastructure. A feature migration must never remove it.
    # Keep the corrected table name: `geography` remains reserved by PostGIS,
    # and revision 001 now creates `chart_geographies` directly.
