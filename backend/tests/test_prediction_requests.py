from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.climate.data_contract import MonthlyClimateRecord
from chart.climate.input_windows import select_input_months
from chart.climate.requests import (
    activate_waiting_prediction_requests,
    claim_prediction_request,
    complete_prediction_request,
    fail_prediction_request,
    get_prediction_request,
    list_prediction_requests,
    list_queued_prediction_requests,
    prepare_prediction_input,
    reconcile_expired_prediction_requests,
    reserve_queued_prediction_requests,
    submit_prediction,
)
from chart.climate.schemas import PredictRequest, PredictionAcceptedResponse
from chart.climate.service import ClimateServiceError
from chart.inference import LbwScore
from chart.shared.db.base import Base
from chart.shared.db.climate_load import load_monthly_climate_records
from chart.shared.db.models import (
    AdminUnit,
    AppGeography,
    ClimateInputMonthRecord,
    ClimateInputWindowRecord,
    ClimateRun,
    CountryGeoConfig,
    DataLabel,
    DataSource,
    DistrictClimate,
    Geography,
    ActiveModelAssignment,
    ModelAreaMapping,
    ModelRelease,
    PredictionRequestRecord,
    Provenance,
)

TEST_NOW = datetime(2026, 7, 22, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    _seed_place_and_model(factory)
    return factory


def _request() -> PredictRequest:
    return PredictRequest(
        geography_id="geo-in-madhya-pradesh",
        planning_date=date(2026, 7, 1),
    )


def _seed_place_and_model(session_factory) -> None:
    with session_factory() as session:
        session.add(
            CountryGeoConfig(
                country_code="IN",
                level_key="state",
                level_label="State",
                sort_order=1,
            )
        )
        place = AppGeography(
            id="geo-in-madhya-pradesh",
            country_code="IN",
            level="state",
            level_label="State",
            name="Madhya Pradesh",
            path="/india/madhya-pradesh",
            external_code="madhya-pradesh",
            sort_order=1,
        )
        session.add(place)
        geography = Geography(
            slug="madhya-pradesh",
            country="India",
            name="Madhya Pradesh",
        )
        session.add(geography)
        session.flush()
        admin_unit = AdminUnit(
            geography_id=geography.id,
            app_geography_id=place.id,
            level="state",
            code="madhya-pradesh",
            name="Madhya Pradesh",
            boundary_version="test-boundary-v1",
        )
        session.add(admin_unit)
        session.flush()
        release = ModelRelease(
            id="lbw-demo-v1",
            module="prediction",
            outcome="lbw",
            version="1.0.0",
            status="active",
            model_files=[{"filename": "state.rds", "sha256": "a" * 64}],
            input_spec={
                "temperature_input": "tmax_monthly_mean_c",
                "months_required": 3,
            },
            activated_at=datetime.now(timezone.utc),
        )
        session.add(release)
        session.flush()
        session.add(
            ModelAreaMapping(
                model_release_id=release.id,
                admin_unit_id=admin_unit.id,
                model_area_key="Madhya Pradesh",
                model_file="state.rds",
            )
        )
        session.add(
            ActiveModelAssignment(
                admin_unit_id=admin_unit.id,
                module="prediction",
                outcome="lbw",
                model_release_id=release.id,
            )
        )
        session.commit()


def _seed_three_climate_months(session_factory) -> None:
    now = TEST_NOW
    with session_factory() as session:
        admin_unit = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "madhya-pradesh")
        )
        assert admin_unit is not None
        observed_records = []
        for period, value in (
            (date(2026, 5, 1), 31.2),
            (date(2026, 6, 1), 30.4),
        ):
            observed_records.append(
                MonthlyClimateRecord(
                    period_month=period,
                    value=value,
                    admin_unit_code=admin_unit.code,
                    admin_unit_level=admin_unit.level,
                    boundary_version="test-boundary-v1",
                    aggregation_method="polygon_cosine_weighted_mean_v1",
                    source_class="observed",
                    source_name="Copernicus ERA5",
                    source_version="ERA5-v1",
                    source_uri="https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels",
                    source_license="Copernicus Licence",
                    source_calendar="gregorian",
                    data_label="sample",
                    quality_status="sample",
                    freshness_status="current",
                    generated_at=now,
                    valid_from=period,
                    valid_to=date(period.year, period.month, 28),
                    fresh_until=now + timedelta(days=30),
                )
            )
        load_monthly_climate_records(
            session,
            admin_unit=admin_unit,
            records=observed_records,
            raw_object_uri="s3://chart-climate/test/era5.nc",
            raw_object_hash="b" * 64,
            provider="Copernicus Climate Change Service",
            product="reanalysis-era5-single-levels",
            access_method="fixture",
        )
        july = date(2026, 7, 1)
        load_monthly_climate_records(
            session,
            admin_unit=admin_unit,
            records=[
                MonthlyClimateRecord(
                    period_month=july,
                    value=29.1,
                    admin_unit_code=admin_unit.code,
                    admin_unit_level=admin_unit.level,
                    boundary_version="test-boundary-v1",
                    aggregation_method="polygon_cosine_weighted_mean_v1",
                    source_class="seasonal",
                    source_name="C3S seasonal monthly single levels",
                    source_version="system-51",
                    source_uri="https://cds.climate.copernicus.eu/datasets/seasonal-monthly-single-levels",
                    source_license="Copernicus Licence",
                    source_calendar="gregorian",
                    data_label="sample",
                    quality_status="sample",
                    freshness_status="current",
                    generated_at=now,
                    valid_from=july,
                    valid_to=date(2026, 7, 31),
                    issue_time=now - timedelta(days=7),
                    ensemble_member="ensemble mean",
                    fresh_until=now + timedelta(days=30),
                )
            ],
            raw_object_uri="s3://chart-climate/test/seasonal.nc",
            raw_object_hash="d" * 64,
            provider="Copernicus Climate Change Service",
            product="seasonal-monthly-single-levels",
            access_method="fixture",
        )
        session.commit()


def _score() -> LbwScore:
    return LbwScore(
        area="Madhya Pradesh",
        geography_level="state",
        pregnancy_window=1,
        temperatures_c=(29.1, 30.4, 31.2),
        reference_temperature_c=27.0,
        odds_ratio=1.12,
        ci95_low=1.02,
        ci95_high=1.22,
        on_training_support=True,
        model_file="state.rds",
        model_version="1.0.0",
        model_sha256="a" * 64,
        warning=None,
    )


def _claim(session_factory, request_id: int, run_id: str) -> str:
    reserved = reserve_queued_prediction_requests(
        session_factory=session_factory,
        owner="test-sensor",
    )
    request = next(item for item in reserved if item.id == request_id)
    assert request.lease_token is not None
    assert claim_prediction_request(
        request_id,
        dagster_run_id=run_id,
        lease_token=request.lease_token,
        session_factory=session_factory,
    )
    return request.lease_token


def test_submit_creates_one_durable_request_without_scoring(session_factory) -> None:
    with patch("chart.climate.service.score_lbw") as score:
        first = submit_prediction(
            _request(), session_factory=session_factory, now=TEST_NOW
        )
        second = submit_prediction(
            _request(), session_factory=session_factory, now=TEST_NOW
        )

    assert isinstance(first, PredictionAcceptedResponse)
    assert first.status == "queued"
    assert second.request_id == first.request_id
    score.assert_not_called()


def test_expired_reservation_is_requeued_with_a_new_lease(
    session_factory,
) -> None:
    accepted = submit_prediction(
        _request(), session_factory=session_factory, now=TEST_NOW
    )
    first = reserve_queued_prediction_requests(
        session_factory=session_factory,
        owner="sensor-one",
        now=TEST_NOW,
    )[0]

    assert first.id == accepted.request_id
    assert first.lease_token is not None
    assert (
        reconcile_expired_prediction_requests(
            session_factory=session_factory,
            now=TEST_NOW + timedelta(hours=2),
        )
        == 1
    )

    second = reserve_queued_prediction_requests(
        session_factory=session_factory,
        owner="sensor-two",
        now=TEST_NOW + timedelta(hours=2, seconds=10),
    )[0]
    assert second.id == accepted.request_id
    assert second.attempt_count == 2
    assert second.lease_token is not None
    assert second.lease_token != first.lease_token


def test_stale_worker_cannot_mutate_a_reassigned_request(session_factory) -> None:
    accepted = submit_prediction(
        _request(), session_factory=session_factory, now=TEST_NOW
    )
    stale_token = _claim(session_factory, accepted.request_id, "worker-one")
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, accepted.request_id)
        assert record is not None
        record.lease_token = "replacement-token"
        record.lease_expires_at = TEST_NOW + timedelta(hours=1)
        session.commit()

    with pytest.raises(ClimateServiceError) as error:
        prepare_prediction_input(
            accepted.request_id,
            live=False,
            lease_token=stale_token,
            session_factory=session_factory,
            now=TEST_NOW,
        )

    assert error.value.code == "PREDICTION_LEASE_LOST"
    with session_factory() as session:
        assert (
            session.scalar(select(func.count()).select_from(PredictionRequestRecord))
            == 1
        )


def test_same_request_on_a_new_day_gets_a_new_source_check(session_factory) -> None:
    first = submit_prediction(
        _request(),
        session_factory=session_factory,
        now=TEST_NOW,
    )
    second = submit_prediction(
        _request(),
        session_factory=session_factory,
        now=TEST_NOW + timedelta(days=1),
    )

    assert first.request_id != second.request_id
    assert first.source_as_of == TEST_NOW.date()
    assert second.source_as_of == (TEST_NOW + timedelta(days=1)).date()


def test_request_history_is_separate_for_each_user(session_factory) -> None:
    first = submit_prediction(
        _request(),
        requested_by_user_id="planner-one",
        session_factory=session_factory,
        now=TEST_NOW,
    )
    second = submit_prediction(
        _request(),
        requested_by_user_id="planner-two",
        session_factory=session_factory,
        now=TEST_NOW,
    )

    assert first.request_id != second.request_id
    history = list_prediction_requests(
        requested_by_user_id="planner-one",
        geography_id="geo-in-madhya-pradesh",
        session_factory=session_factory,
    )
    assert [item.request_id for item in history.items] == [first.request_id]

    with pytest.raises(ClimateServiceError, match="PREDICTION_REQUEST_NOT_FOUND"):
        get_prediction_request(
            first.request_id,
            requested_by_user_id="planner-two",
            session_factory=session_factory,
        )


def test_model_cannot_run_before_three_climate_rows_are_saved(session_factory) -> None:
    accepted = submit_prediction(_request(), session_factory=session_factory)

    with (
        patch("chart.climate.service.score_lbw") as score,
        pytest.raises(ClimateServiceError, match="CLIMATE_DATA_NOT_READY"),
    ):
        complete_prediction_request(
            accepted.request_id,
            session_factory=session_factory,
        )
    score.assert_not_called()


def test_saved_climate_window_is_the_only_input_sent_to_model(session_factory) -> None:
    accepted = submit_prediction(_request(), session_factory=session_factory)
    lease_token = _claim(session_factory, accepted.request_id, "dagster-test-1")
    _seed_three_climate_months(session_factory)

    window_id = prepare_prediction_input(
        accepted.request_id,
        live=False,
        lease_token=lease_token,
        session_factory=session_factory,
        now=TEST_NOW,
    )
    with patch("chart.climate.service.score_lbw", return_value=_score()) as score:
        result = complete_prediction_request(
            accepted.request_id,
            lease_token=lease_token,
            session_factory=session_factory,
        )

    score.assert_called_once_with(
        model_area="Madhya Pradesh",
        pregnancy_window=1,
        temperatures_c=(29.1, 30.4, 31.2),
        service_url=None,
        expected_model_version="1.0.0",
        expected_model_sha256="a" * 64,
    )
    assert result.request_status == "completed"
    assert result.availability.input_window_id == window_id
    assert [item.temperature_c for item in result.climate] == [29.1, 30.4, 31.2]
    assert result.climate[0].raw_file_uri == "s3://chart-climate/test/seasonal.nc"
    assert result.prediction.model_version == "1.0.0"
    assert [item.pregnancy_window for item in result.predictions] == [1]

    status = get_prediction_request(
        accepted.request_id,
        session_factory=session_factory,
    )
    assert status.status == "completed"
    assert status.result is not None
    with session_factory() as session:
        assert (
            session.scalar(select(func.count()).select_from(ClimateInputWindowRecord))
            == 1
        )
        assert (
            session.scalar(select(func.count()).select_from(ClimateInputMonthRecord))
            == 3
        )


def test_one_planning_request_scores_all_three_pregnancy_stages(
    session_factory,
) -> None:
    request = _request().model_copy(update={"pregnancy_windows": (3, 2, 1)})
    accepted = submit_prediction(request, session_factory=session_factory)
    lease_token = _claim(session_factory, accepted.request_id, "dagster-three-stages")
    _seed_three_climate_months(session_factory)
    prepare_prediction_input(
        accepted.request_id,
        live=False,
        lease_token=lease_token,
        session_factory=session_factory,
        now=TEST_NOW,
    )

    def score_for_stage(*_args, pregnancy_window: int, **_kwargs):
        return _score().__class__(
            **{
                **_score().__dict__,
                "pregnancy_window": pregnancy_window,
                "odds_ratio": {3: 1.08, 2: 1.15, 1: 1.12}[pregnancy_window],
            }
        )

    with patch("chart.climate.service.score_lbw", side_effect=score_for_stage) as score:
        result = complete_prediction_request(
            accepted.request_id,
            lease_token=lease_token,
            session_factory=session_factory,
        )

    assert score.call_count == 3
    assert [item.pregnancy_window for item in result.predictions] == [3, 2, 1]
    assert result.prediction.pregnancy_window == 3

    with session_factory() as session:
        mapping = session.scalar(select(ModelAreaMapping))
        assert mapping is not None
        mapping.validated_pregnancy_windows = [1]
        session.commit()

    public_status = get_prediction_request(
        accepted.request_id,
        session_factory=session_factory,
    )
    assert public_status.result is not None
    assert [item.pregnancy_window for item in public_status.result.predictions] == [1]
    assert public_status.result.prediction.pregnancy_window == 1


def test_state_mapping_rejects_unvalidated_pregnancy_windows(
    session_factory,
) -> None:
    with session_factory() as session:
        mapping = session.scalar(select(ModelAreaMapping))
        assert mapping is not None
        mapping.validated_pregnancy_windows = [1]
        session.commit()

    with pytest.raises(ClimateServiceError) as error:
        submit_prediction(
            _request().model_copy(update={"pregnancy_windows": (3, 2, 1)}),
            session_factory=session_factory,
        )

    assert error.value.code == "MODEL_PREGNANCY_WINDOW_NOT_VALIDATED"

    accepted = submit_prediction(
        _request().model_copy(update={"pregnancy_windows": (1,)}),
        session_factory=session_factory,
    )
    assert isinstance(accepted, PredictionAcceptedResponse)


def test_next_heat_season_waits_then_queues_when_forecast_can_cover_it(
    session_factory,
) -> None:
    request = PredictRequest(
        geography_id="geo-in-madhya-pradesh",
        planning_date=date(2027, 5, 1),
        planning_target="next_heat_season",
        pregnancy_windows=(3, 2, 1),
    )
    accepted = submit_prediction(
        request,
        requested_by_user_id="planner-one",
        session_factory=session_factory,
        now=TEST_NOW,
    )

    assert accepted.status == "waiting"
    assert accepted.stage == "waiting_for_data"
    assert accepted.available_from == date(2026, 12, 7)
    assert list_queued_prediction_requests(session_factory=session_factory) == []

    activated = activate_waiting_prediction_requests(
        session_factory=session_factory,
        now=datetime(2026, 12, 7, tzinfo=timezone.utc),
    )
    queued = list_queued_prediction_requests(session_factory=session_factory)

    assert activated == 1
    assert [item.id for item in queued] == [accepted.request_id]
    assert queued[0].source_as_of == datetime(2026, 12, 7, tzinfo=timezone.utc)


def test_input_selection_ignores_rows_from_an_old_boundary(session_factory) -> None:
    _seed_three_climate_months(session_factory)
    now = TEST_NOW
    with session_factory() as session:
        admin_unit = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "madhya-pradesh")
        )
        assert admin_unit is not None
        load_monthly_climate_records(
            session,
            admin_unit=admin_unit,
            records=[
                MonthlyClimateRecord(
                    period_month=date(2026, 7, 1),
                    value=99.0,
                    admin_unit_code=admin_unit.code,
                    admin_unit_level=admin_unit.level,
                    boundary_version="old-boundary-v0",
                    aggregation_method="polygon_cosine_weighted_mean_v1",
                    source_class="seasonal",
                    source_name="C3S seasonal monthly single levels",
                    source_version="system-51",
                    source_uri="https://cds.climate.copernicus.eu/",
                    source_license="Copernicus Licence",
                    source_calendar="gregorian",
                    data_label="sample",
                    quality_status="sample",
                    freshness_status="current",
                    generated_at=now,
                    valid_from=date(2026, 7, 1),
                    valid_to=date(2026, 7, 31),
                    issue_time=now,
                    ensemble_member="ensemble mean",
                    fresh_until=now + timedelta(days=30),
                )
            ],
            raw_object_uri="s3://chart-climate/test/old-boundary.nc",
            raw_object_hash="c" * 64,
            provider="Copernicus Climate Change Service",
            product="seasonal-monthly-single-levels",
            access_method="fixture",
        )
        session.commit()

        selected = select_input_months(
            session,
            admin_unit_id=admin_unit.id,
            target_end_month=date(2026, 7, 1),
            now=now,
        )

    assert [row[1][0].value for row in selected if row[1] is not None] == [
        29.1,
        30.4,
        31.2,
    ]


def test_future_month_never_uses_an_era5_row(session_factory) -> None:
    with session_factory() as session:
        admin_unit = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "madhya-pradesh")
        )
        assert admin_unit is not None
        august = date(2026, 8, 1)
        load_monthly_climate_records(
            session,
            admin_unit=admin_unit,
            records=[
                MonthlyClimateRecord(
                    period_month=august,
                    value=99.0,
                    admin_unit_code=admin_unit.code,
                    admin_unit_level=admin_unit.level,
                    boundary_version="test-boundary-v1",
                    aggregation_method="polygon_cosine_weighted_mean_v1",
                    source_class="observed",
                    source_name="Copernicus ERA5",
                    source_version="ERA5-v1",
                    source_uri="https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels",
                    source_license="Copernicus Licence",
                    source_calendar="gregorian",
                    data_label="sample",
                    quality_status="sample",
                    freshness_status="current",
                    generated_at=TEST_NOW,
                    valid_from=august,
                    valid_to=date(2026, 8, 31),
                    fresh_until=TEST_NOW + timedelta(days=30),
                )
            ],
            raw_object_uri="s3://chart-climate/test/future-era5.nc",
            raw_object_hash="e" * 64,
            provider="Copernicus Climate Change Service",
            product="reanalysis-era5-single-levels",
            access_method="fixture",
        )
        session.commit()

        selected = select_input_months(
            session,
            admin_unit_id=admin_unit.id,
            target_end_month=august,
            now=TEST_NOW,
        )

    assert selected[0][0] == august
    assert selected[0][1] is None


def test_numeric_result_is_saved_before_optional_explanation(session_factory) -> None:
    accepted = submit_prediction(_request(), session_factory=session_factory)
    lease_token = _claim(
        session_factory, accepted.request_id, "dagster-test-explanation"
    )
    _seed_three_climate_months(session_factory)
    prepare_prediction_input(
        accepted.request_id,
        live=False,
        lease_token=lease_token,
        session_factory=session_factory,
        now=TEST_NOW,
    )

    def explain_after_commit(_score):
        with session_factory() as session:
            saved = session.get(PredictionRequestRecord, accepted.request_id)
            assert saved is not None
            assert saved.status == "completed"
            assert saved.result_payload is not None
            assert saved.result_payload["prediction"]["explanation"] is None
        return "Saved result explained in plain language."

    with (
        patch("chart.climate.service.score_lbw", return_value=_score()),
        patch(
            "chart.climate.requests.explain_if_configured",
            side_effect=explain_after_commit,
        ),
    ):
        result = complete_prediction_request(
            accepted.request_id,
            lease_token=lease_token,
            session_factory=session_factory,
        )

    assert result.prediction.explanation == "Saved result explained in plain language."
    with session_factory() as session:
        saved = session.get(PredictionRequestRecord, accepted.request_id)
        assert saved is not None
        assert (
            saved.result_payload["prediction"]["explanation"]
            == "Saved result explained in plain language."
        )


def test_score_rejects_place_from_country_without_approved_model(
    session_factory,
) -> None:
    """A release is usable only where it has an explicit active assignment."""

    with session_factory() as session:
        session.add(
            CountryGeoConfig(
                country_code="KE",
                level_key="state",
                level_label="County",
                sort_order=1,
            )
        )
        place = AppGeography(
            id="geo-ke-nairobi",
            country_code="KE",
            level="state",
            level_label="County",
            name="Nairobi",
            path="/kenya/nairobi",
            external_code="nairobi",
            sort_order=1,
        )
        session.add(place)
        geography = Geography(
            slug="nairobi",
            country="Kenya",
            name="Nairobi",
        )
        session.add(geography)
        session.flush()
        session.add(
            AdminUnit(
                geography_id=geography.id,
                app_geography_id=place.id,
                level="state",
                code="nairobi",
                name="Nairobi",
                boundary_version="test-boundary-v1",
            )
        )
        session.commit()

    with pytest.raises(ClimateServiceError) as error:
        submit_prediction(
            PredictRequest(
                geography_id="geo-ke-nairobi",
                planning_date=date(2026, 7, 1),
            ),
            session_factory=session_factory,
        )

    assert error.value.code == "MODEL_NOT_AVAILABLE_FOR_PLACE"


def test_partial_reanalysis_month_is_not_selected_as_input(session_factory) -> None:
    """tdd.md §4: an incomplete ERA5 (reanalysis) month is rejected."""

    with session_factory() as session:
        admin_unit = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "madhya-pradesh")
        )
        assert admin_unit is not None
        june = date(2026, 6, 1)
        data_source = DataSource(
            name="ERA5 monthly (partial)",
            kind="reanalysis",
            provider="Copernicus Climate Change Service",
            product="reanalysis-era5-single-levels",
            version="ERA5-partial",
            access_method="fixture",
            source_uri="https://cds.climate.copernicus.eu/",
            license="Copernicus Licence",
        )
        session.add(data_source)
        provenance = Provenance(
            source_uri="https://cds.climate.copernicus.eu/era5-partial",
            input_hash="f" * 64,
            license="Copernicus Licence",
        )
        session.add(provenance)
        session.flush()
        run = ClimateRun(
            data_source_id=data_source.id,
            provenance_id=provenance.id,
            tier="observed",
            source_class="observed",
            input_hash="e" * 64,
            data_label=DataLabel.reanalysis,
            generated_at=TEST_NOW,
            valid_from=june,
            valid_to=date(2026, 6, 30),
            fresh_until=TEST_NOW + timedelta(days=30),
            boundary_version="test-boundary-v1",
            aggregation_version="polygon_cosine_weighted_mean_v1",
            quality_status="validated",
        )
        session.add(run)
        session.flush()
        session.add(
            DistrictClimate(
                admin_unit_id=admin_unit.id,
                climate_run_id=run.id,
                period_month=june,
                variable="tmax_monthly_mean_c",
                value=29.5,
                agg_method="polygon_cosine_weighted_mean_v1",
                unit="degC",
                quality_status="validated",
                observed_days=15,
                expected_days=30,
            )
        )
        session.commit()

        selected = select_input_months(
            session,
            admin_unit_id=admin_unit.id,
            target_end_month=date(2026, 6, 1),
            now=TEST_NOW,
        )

    june_month, june_row = next(item for item in selected if item[0] == june)
    assert june_month == june
    assert june_row is None


def test_failed_request_is_requeued_with_same_id(session_factory) -> None:
    accepted = submit_prediction(_request(), session_factory=session_factory)
    fail_prediction_request(
        accepted.request_id,
        error_code="CLIMATE_PULL_FAILED",
        session_factory=session_factory,
    )

    retried = submit_prediction(_request(), session_factory=session_factory)

    assert isinstance(retried, PredictionAcceptedResponse)
    assert retried.request_id == accepted.request_id
    assert retried.status == "queued"
    with session_factory() as session:
        record = session.get(PredictionRequestRecord, accepted.request_id)
        assert record is not None
        assert record.attempt_count == 2
        assert record.error_code is None
