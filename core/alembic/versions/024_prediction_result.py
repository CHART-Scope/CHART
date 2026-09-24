"""store predictions on the grain that identifies them

Revision ID: 024_prediction_result
Revises: 023_daily_climate_grain
Create Date: 2026-09-18

A prediction was only ever stored as JSON inside ``prediction_request``. That
table records a *job* - who asked, when, its lease, its attempts - and its
identity hash deliberately includes the requester and the submission date, so
the same place and month forks a new row per user per day. Nothing in the
schema answered "has this month been computed?", the dashboard had to read
every completed request for a user and filter in Python, and a month computed
by one planner was invisible to the next.

This adds the results half that ``docs/tdd.md`` already describes, keyed on
what actually identifies a prediction: place, outcome, model release, month,
scenario and horizon. It carries no requester - a result is a fact about a
place and a month, not about who asked for it.

``health_impact`` is untouched. Its grain has no outcome, so two outcomes for
one place and month would collide, and its ``erf_parameters_id`` is NOT NULL
against a table that cannot be populated yet. It stays for the
exposure-response direction it was designed for.

The backfill reads completed requests through the same derivation the write
path uses, so a backfilled month and a freshly computed one agree.
"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "024_prediction_result"
down_revision = "023_daily_climate_grain"
branch_labels = None
depends_on = None


PLANNING_TARGET_TO_HORIZON = {
    "month": "m1",
    "next_three_months": "m3",
    "next_heat_season": "m6",
    "long_term_hot_season": "y15",
}

SSP_TO_RCP = {
    "ssp126": "rcp26",
    "ssp245": "rcp45",
    "ssp370": "rcp60",
    "ssp585": "rcp85",
}


def _data_label_type() -> postgresql.ENUM:
    """Reference the pre-existing ``data_label`` enum, as migration 016 does.

    ``create_type=False`` stops SQLAlchemy re-emitting ``CREATE TYPE`` when the
    type is attached to a column in a new table.
    """

    return postgresql.ENUM(
        "modeled",
        "observed",
        "reanalysis",
        "forecast",
        "projection",
        "sample",
        name="data_label",
        create_type=False,
    )


def _clamp_milli(value: float) -> int:
    return max(0, min(100_000, int(round(value))))


def _attributable_fraction_milli(
    odds_ratio: float,
    temperature_c: float | None,
    reference_temperature_c: float | None,
) -> int:
    """Mirror of ``health_impact.derivation.attributable_fraction_milli``.

    Duplicated deliberately: a migration must keep working when the
    application code around it moves on, so it pins the formula it ran with
    rather than importing one that may change underneath it.
    """
    if odds_ratio <= 1:
        return 0
    if (
        temperature_c is not None
        and reference_temperature_c is not None
        and temperature_c < reference_temperature_c
    ):
        return 0
    return _clamp_milli((odds_ratio - 1) / odds_ratio * 1000)


def upgrade() -> None:
    op.create_table(
        "prediction_result",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "admin_unit_id",
            sa.Integer(),
            sa.ForeignKey("admin_unit.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("outcome", sa.String(length=64), nullable=False),
        sa.Column(
            "model_release_id",
            sa.String(length=128),
            sa.ForeignKey("model_release.id"),
            nullable=False,
        ),
        sa.Column("valid_month", sa.Date(), nullable=False),
        sa.Column("scenario", sa.String(length=32), nullable=False),
        sa.Column("horizon", sa.String(length=16), nullable=False),
        sa.Column(
            "pregnancy_window",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("odds_ratio", sa.Float(), nullable=False),
        sa.Column("ci95_low", sa.Float(), nullable=False),
        sa.Column("ci95_high", sa.Float(), nullable=False),
        sa.Column("attributable_fraction_milli", sa.Integer(), nullable=False),
        sa.Column("reference_temperature_c", sa.Float()),
        sa.Column("reference_kind", sa.String(length=32)),
        sa.Column(
            "on_training_support",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("warning", sa.Text()),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("model_artifact_sha256", sa.String(length=64)),
        sa.Column(
            "exposure_values_c",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "exposure_dates",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("input_statistic", sa.String(length=64)),
        sa.Column("data_label", _data_label_type(), nullable=False),
        sa.Column(
            "climate_input_window_id",
            sa.Integer(),
            sa.ForeignKey("climate_input_window.id"),
        ),
        sa.Column(
            "prediction_request_id",
            sa.Integer(),
            sa.ForeignKey("prediction_request.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "admin_unit_id",
            "outcome",
            "model_release_id",
            "valid_month",
            "scenario",
            "horizon",
            "pregnancy_window",
            name="uq_prediction_result_grain",
        ),
    )
    op.create_index(
        "ix_prediction_result_dashboard_read",
        "prediction_result",
        ["admin_unit_id", "outcome", "valid_month"],
    )

    _backfill(op.get_bind())


def _backfill(bind) -> None:
    """Carry existing completed predictions onto the new grain.

    Newest first, and the grain is claimed by the first writer, so where the
    same month was computed more than once - by two users, or on two days -
    the most recently completed result wins. That matches what the dashboard
    already showed, which ordered by ``completed_at DESC`` and kept the first.
    """
    rows = bind.execute(
        sa.text(
            """
            SELECT r.id, r.admin_unit_id, r.planning_date, r.model_release_id,
                   r.model_artifact_sha256, r.climate_input_window_id,
                   r.request_payload, r.result_payload
            FROM prediction_request r
            WHERE r.status = 'completed'
              AND r.result_payload IS NOT NULL
              AND r.admin_unit_id IS NOT NULL
              AND r.planning_date IS NOT NULL
              AND r.model_release_id IS NOT NULL
            ORDER BY r.completed_at DESC NULLS LAST, r.id DESC
            """
        )
    ).mappings()

    seen: set[tuple] = set()
    written = 0
    for row in rows:
        payload = row["result_payload"]
        request = row["request_payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        if isinstance(request, str):
            request = json.loads(request)
        prediction = (payload or {}).get("prediction")
        if not prediction:
            continue

        outcome = (request or {}).get("outcome") or "lbw"
        planning_target = (request or {}).get("planning_target") or "month"
        ssp = (request or {}).get("projection_scenario")
        scenario = "seas5_ensemble" if ssp is None else SSP_TO_RCP.get(ssp, ssp)
        horizon = PLANNING_TARGET_TO_HORIZON.get(planning_target, "m1")
        valid_month = row["planning_date"].replace(day=1)

        key = (
            row["admin_unit_id"],
            outcome,
            row["model_release_id"],
            valid_month,
            scenario,
            horizon,
            prediction.get("pregnancy_window") or 0,
        )
        if key in seen:
            continue
        seen.add(key)

        # Describe the climate that was actually scored, not the scenario that
        # was asked for. The dashboard's monthly card reports observed months,
        # so labelling a reanalysis-backed month "forecast" would hide every
        # backfilled row behind the read filter.
        climate = payload.get("climate") or []
        labels = {item.get("data_label") for item in climate}
        sources = {item.get("source_class") for item in climate}
        if "sample" in labels:
            data_label = "sample"
        elif "projection" in sources:
            data_label = "projection"
        elif "seasonal" in sources or "forecast" in labels:
            data_label = "forecast"
        else:
            data_label = "reanalysis"
        # 0 means the model has no pregnancy window; it is part of the grain.
        window = prediction.get("pregnancy_window") or 0

        month_key = valid_month.strftime("%Y-%m")
        selected = next(
            (
                item.get("temperature_c")
                for item in (payload.get("climate") or [])
                if item.get("month") == month_key
            ),
            None,
        )
        fraction = _attributable_fraction_milli(
            prediction["odds_ratio"],
            selected,
            prediction.get("reference_temperature_c"),
        )

        bind.execute(
            sa.text(
                """
                INSERT INTO prediction_result (
                    admin_unit_id, outcome, model_release_id, valid_month,
                    scenario, horizon, odds_ratio, ci95_low, ci95_high,
                    attributable_fraction_milli, reference_temperature_c,
                    on_training_support, warning, model_version,
                    model_artifact_sha256, exposure_values_c, exposure_dates,
                    data_label, pregnancy_window,
                    climate_input_window_id, prediction_request_id
                ) VALUES (
                    :admin_unit_id, :outcome, :model_release_id, :valid_month,
                    :scenario, :horizon, :odds_ratio, :ci95_low, :ci95_high,
                    :fraction, :reference_temperature_c,
                    :on_training_support, :warning, :model_version,
                    :sha256, :exposure_values, :exposure_dates,
                    :data_label, :window,
                    :window_id, :request_id
                )
                """
            ),
            {
                "admin_unit_id": row["admin_unit_id"],
                "outcome": outcome,
                "model_release_id": row["model_release_id"],
                "valid_month": valid_month,
                "scenario": scenario,
                "horizon": horizon,
                "odds_ratio": prediction["odds_ratio"],
                "ci95_low": prediction["ci95_low"],
                "ci95_high": prediction["ci95_high"],
                "fraction": fraction,
                "reference_temperature_c": prediction.get("reference_temperature_c"),
                "on_training_support": bool(
                    prediction.get("on_training_support", True)
                ),
                "warning": prediction.get("warning"),
                "model_version": prediction.get("model_version") or "unknown",
                "sha256": row["model_artifact_sha256"]
                or prediction.get("model_sha256"),
                "exposure_values": json.dumps(
                    list(prediction.get("temperatures_c") or [])
                ),
                "exposure_dates": json.dumps(
                    list(prediction.get("exposure_dates") or [])
                ),
                "data_label": data_label,
                "window": window,
                "window_id": row["climate_input_window_id"],
                "request_id": row["id"],
            },
        )
        written += 1
    print(f"024_prediction_result: backfilled {written} prediction(s)")


def downgrade() -> None:
    op.drop_index("ix_prediction_result_dashboard_read", table_name="prediction_result")
    op.drop_table("prediction_result")
