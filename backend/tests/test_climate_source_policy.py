from datetime import date, datetime, timezone

from chart.climate.source_policy import (
    CLIMATE_SOURCE_POLICY_VERSION,
    latest_seasonal_issue_month,
    resolve_month_source,
    seasonal_issue_covers,
    seasonal_last_supported_month,
)

NOW = datetime(2026, 7, 22, 12, 0, tzinfo=timezone.utc)


def test_completed_months_use_era5_and_future_months_use_seasonal() -> None:
    june = resolve_month_source(date(2026, 6, 1), now=NOW)
    july = resolve_month_source(date(2026, 7, 1), now=NOW)
    december = resolve_month_source(date(2026, 12, 1), now=NOW)

    assert june.source_class == "observed"
    assert july.source_class == "seasonal"
    assert december.source_class == "seasonal"
    assert {june.policy_version, july.policy_version, december.policy_version} == {
        CLIMATE_SOURCE_POLICY_VERSION
    }


def test_month_after_seasonal_range_is_explicitly_unavailable() -> None:
    decision = resolve_month_source(date(2027, 1, 1), now=NOW)

    assert decision.source_class is None
    assert decision.unavailable_reason == "CLIMATE_LONG_TERM_SCENARIO_REQUIRED"


def test_long_term_month_requires_and_keeps_the_explicit_scenario() -> None:
    for scenario in ("ssp126", "ssp370", "ssp585"):
        decision = resolve_month_source(
            date(2040, 5, 1),
            now=NOW,
            projection_scenario=scenario,
            projection_period="2031-2040",
        )

        assert decision.source_class == "projection"
        assert scenario in decision.source_name
        assert "2031–2040 average" in decision.source_name


def test_long_term_choice_cannot_be_used_for_an_unapproved_month() -> None:
    decision = resolve_month_source(
        date(2040, 6, 1),
        now=NOW,
        projection_scenario="ssp370",
        projection_period="2031-2040",
    )

    assert decision.source_class is None
    assert decision.unavailable_reason == "CLIMATE_PROJECTION_CHOICE_INVALID"


def test_seasonal_publication_day_changes_the_supported_end_month() -> None:
    before_release = datetime(2026, 7, 6, 12, 0, tzinfo=timezone.utc)
    after_release = datetime(2026, 7, 7, 12, 0, tzinfo=timezone.utc)

    assert latest_seasonal_issue_month(before_release) == date(2026, 6, 1)
    assert seasonal_last_supported_month(before_release) == date(2026, 11, 1)
    assert latest_seasonal_issue_month(after_release) == date(2026, 7, 1)
    assert seasonal_last_supported_month(after_release) == date(2026, 12, 1)


def test_seasonal_row_must_match_its_own_six_month_issue_range() -> None:
    july_issue = datetime(2026, 7, 1, tzinfo=timezone.utc)

    assert seasonal_issue_covers(july_issue, date(2026, 12, 1))
    assert not seasonal_issue_covers(july_issue, date(2027, 1, 1))
    assert not seasonal_issue_covers(None, date(2026, 12, 1))
