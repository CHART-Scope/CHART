"""add place, model release, and three-month prediction data links

Revision ID: 006_prediction_data_spine
Revises: 005_admin_unit_boundaries
Create Date: 2026-07-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "006_prediction_data_spine"
down_revision = "005_admin_unit_boundaries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE data_label ADD VALUE IF NOT EXISTS 'forecast'")
        op.execute("ALTER TYPE data_label ADD VALUE IF NOT EXISTS 'projection'")

    if not inspector.has_table("country_geo_config"):
        op.create_table(
            "country_geo_config",
            sa.Column("country_code", sa.String(length=8), nullable=False),
            sa.Column("level_key", sa.String(length=32), nullable=False),
            sa.Column("level_label", sa.String(length=64), nullable=False),
            sa.Column(
                "enabled", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("country_code", "level_key"),
        )

    if not inspector.has_table("geographies"):
        op.create_table(
            "geographies",
            sa.Column("id", sa.String(length=128), primary_key=True),
            sa.Column("country_code", sa.String(length=8), nullable=False),
            sa.Column("level", sa.String(length=32), nullable=False),
            sa.Column("level_label", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("parent_id", sa.String(length=128)),
            sa.Column("external_code", sa.String(length=128)),
            sa.Column("path", sa.String(length=512), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["parent_id"],
                ["geographies.id"],
                name="geographies_parent_id_geographies_id_fk",
                ondelete="SET NULL",
            ),
            sa.ForeignKeyConstraint(
                ["country_code", "level"],
                [
                    "country_geo_config.country_code",
                    "country_geo_config.level_key",
                ],
                name="geographies_country_level_country_geo_config_fk",
                ondelete="RESTRICT",
            ),
            sa.UniqueConstraint("path", name="geographies_path_unique"),
        )
        op.create_index(
            "geographies_country_level_idx",
            "geographies",
            ["country_code", "level", "sort_order"],
        )
        op.create_index(
            "geographies_parent_idx",
            "geographies",
            ["parent_id", "sort_order"],
        )

    _add_column(
        "admin_unit",
        sa.Column("app_geography_id", sa.String(length=128), nullable=True),
    )
    _add_column(
        "admin_unit",
        sa.Column("boundary_version", sa.String(length=128), nullable=True),
    )
    _create_fk(
        "fk_admin_unit_app_geography",
        "admin_unit",
        "geographies",
        ["app_geography_id"],
        ["id"],
        ondelete="SET NULL",
    )
    _create_unique("uq_admin_unit_app_geography", "admin_unit", ["app_geography_id"])

    for column in (
        sa.Column("provider", sa.String(length=128)),
        sa.Column("product", sa.String(length=128)),
        sa.Column("version", sa.String(length=128)),
        sa.Column("access_method", sa.String(length=64)),
        sa.Column("source_uri", sa.Text()),
        sa.Column("license", sa.String(length=256)),
    ):
        _add_column("data_source", column)

    for column in (
        sa.Column("source_class", sa.String(length=32)),
        sa.Column("issue_time", sa.DateTime(timezone=True)),
        sa.Column("valid_from", sa.Date()),
        sa.Column("valid_to", sa.Date()),
        sa.Column("fresh_until", sa.DateTime(timezone=True)),
        sa.Column("ensemble_summary", sa.String(length=128)),
        sa.Column("boundary_version", sa.String(length=128)),
        sa.Column("aggregation_version", sa.String(length=128)),
        sa.Column("downscaling_method", sa.String(length=128)),
        sa.Column("quality_status", sa.String(length=32)),
        sa.Column("raw_object_uri", sa.Text()),
        sa.Column("raw_object_hash", sa.String(length=64)),
    ):
        _add_column("climate_run", column)

    for column in (
        sa.Column("observed_days", sa.Integer()),
        sa.Column("expected_days", sa.Integer()),
        sa.Column("quality_status", sa.String(length=32)),
        sa.Column("record_hash", sa.String(length=64)),
    ):
        _add_column("district_climate", column)

    op.create_table(
        "model_release",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("module", sa.String(length=64), nullable=False),
        sa.Column("outcome", sa.String(length=64), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("model_files", sa.JSON(), nullable=False),
        sa.Column("input_spec", sa.JSON(), nullable=False),
        sa.Column("release_notes", sa.Text()),
        sa.Column("source_git_ref", sa.String(length=128)),
        sa.Column("release_file_uri", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("activated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("module", "outcome", "version", name="uq_model_release"),
    )
    op.create_index(
        "ix_model_release_status",
        "model_release",
        ["module", "outcome", "status"],
    )

    op.create_table(
        "model_area_mapping",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "model_release_id",
            sa.String(length=128),
            sa.ForeignKey("model_release.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model_area_key", sa.String(length=128), nullable=False),
        sa.Column("model_file", sa.String(length=256), nullable=False),
        sa.UniqueConstraint(
            "model_release_id",
            "admin_unit_id",
            name="uq_model_area_release_admin",
        ),
    )

    op.create_table(
        "climate_input_window",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id"),
            nullable=False,
        ),
        sa.Column("target_end_month", sa.Date(), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("contract_version", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "climate_input_month",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "climate_input_window_id",
            sa.Integer(),
            sa.ForeignKey("climate_input_window.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "district_climate_id",
            sa.Integer(),
            sa.ForeignKey("district_climate.id"),
            nullable=False,
        ),
        sa.Column("lag_index", sa.Integer(), nullable=False),
        sa.UniqueConstraint(
            "climate_input_window_id",
            "lag_index",
            name="uq_climate_input_window_lag",
        ),
        sa.UniqueConstraint(
            "climate_input_window_id",
            "district_climate_id",
            name="uq_climate_input_window_value",
        ),
    )

    for column in (
        sa.Column("admin_unit_id", sa.Integer()),
        sa.Column("planning_date", sa.Date()),
        sa.Column("climate_input_window_id", sa.Integer()),
        sa.Column("model_release_id", sa.String(length=128)),
        sa.Column("requested_by_user_id", sa.String(length=128)),
        sa.Column("pipeline_version", sa.String(length=64)),
    ):
        _add_column("prediction_request", column)

    _create_fk(
        "fk_prediction_request_admin_unit",
        "prediction_request",
        "admin_unit",
        ["admin_unit_id"],
        ["id"],
    )
    _create_fk(
        "fk_prediction_request_climate_input",
        "prediction_request",
        "climate_input_window",
        ["climate_input_window_id"],
        ["id"],
    )
    _create_fk(
        "fk_prediction_request_model_release",
        "prediction_request",
        "model_release",
        ["model_release_id"],
        ["id"],
    )


def downgrade() -> None:
    for constraint in (
        "fk_prediction_request_model_release",
        "fk_prediction_request_climate_input",
        "fk_prediction_request_admin_unit",
    ):
        op.drop_constraint(constraint, "prediction_request", type_="foreignkey")
    for column in (
        "pipeline_version",
        "requested_by_user_id",
        "model_release_id",
        "climate_input_window_id",
        "planning_date",
        "admin_unit_id",
    ):
        op.drop_column("prediction_request", column)

    op.drop_table("climate_input_month")
    op.drop_table("climate_input_window")
    op.drop_table("model_area_mapping")
    op.drop_index("ix_model_release_status", table_name="model_release")
    op.drop_table("model_release")

    for column in ("record_hash", "quality_status", "expected_days", "observed_days"):
        op.drop_column("district_climate", column)
    for column in (
        "raw_object_hash",
        "raw_object_uri",
        "quality_status",
        "downscaling_method",
        "aggregation_version",
        "boundary_version",
        "ensemble_summary",
        "fresh_until",
        "valid_to",
        "valid_from",
        "issue_time",
        "source_class",
    ):
        op.drop_column("climate_run", column)
    for column in (
        "license",
        "source_uri",
        "access_method",
        "version",
        "product",
        "provider",
    ):
        op.drop_column("data_source", column)

    op.drop_constraint("uq_admin_unit_app_geography", "admin_unit", type_="unique")
    op.drop_constraint("fk_admin_unit_app_geography", "admin_unit", type_="foreignkey")
    op.drop_column("admin_unit", "boundary_version")
    op.drop_column("admin_unit", "app_geography_id")
    # The user/place tables may predate this Alembic revision, so they are retained.


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _add_column(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _constraint_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    names = {
        item["name"]
        for item in inspector.get_foreign_keys(table_name)
        if item.get("name")
    }
    names.update(
        item["name"]
        for item in inspector.get_unique_constraints(table_name)
        if item.get("name")
    )
    return names


def _create_fk(name: str, source: str, target: str, local, remote, **kwargs) -> None:
    if name not in _constraint_names(source):
        op.create_foreign_key(name, source, target, local, remote, **kwargs)


def _create_unique(name: str, table: str, columns: list[str]) -> None:
    if name not in _constraint_names(table):
        op.create_unique_constraint(name, table, columns)
