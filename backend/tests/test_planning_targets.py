from datetime import date, datetime, timezone

from chart.climate.planning_targets import planning_options_for_place


def test_next_heat_season_is_relative_and_limited_by_available_data() -> None:
    options = planning_options_for_place(
        "madhya-pradesh",
        now=datetime(2026, 7, 22, tzinfo=timezone.utc),
    )

    assert options.custom_max_month == date(2026, 12, 1)
    assert options.next_three_months.months == (
        date(2026, 8, 1),
        date(2026, 9, 1),
        date(2026, 10, 1),
    )
    assert options.next_three_months.available
    assert options.next_heat_season is not None
    assert options.next_heat_season.months == (
        date(2027, 3, 1),
        date(2027, 4, 1),
        date(2027, 5, 1),
    )
    assert options.next_heat_season.planning_date == date(2027, 5, 1)
    assert not options.next_heat_season.available
    assert options.next_heat_season.available_from == date(2026, 12, 7)
    assert options.long_term_projection is not None
    assert options.long_term_projection.period == "2031-2040"
    assert options.long_term_projection.months == (
        date(2040, 3, 1),
        date(2040, 4, 1),
        date(2040, 5, 1),
    )
    assert {item.value for item in options.long_term_projection.scenarios} == {
        "ssp126",
        "ssp370",
        "ssp585",
    }


def test_next_heat_season_becomes_available_when_c3s_can_cover_it() -> None:
    options = planning_options_for_place(
        "madhya-pradesh",
        now=datetime(2026, 12, 7, tzinfo=timezone.utc),
    )

    assert options.custom_max_month == date(2027, 5, 1)
    assert options.next_heat_season is not None
    assert options.next_heat_season.available
    assert options.next_heat_season.available_from is None


def test_place_without_an_approved_heat_calendar_keeps_custom_dates_only() -> None:
    options = planning_options_for_place(
        "not-configured",
        now=datetime(2026, 7, 22, tzinfo=timezone.utc),
    )

    assert options.next_heat_season is None
    assert options.long_term_projection is None


def test_mp_division_inherits_the_state_heat_calendar() -> None:
    options = planning_options_for_place(
        "bhopal",
        geography_path="/india/madhya-pradesh/bhopal",
        now=datetime(2026, 7, 22, tzinfo=timezone.utc),
    )

    assert options.next_heat_season is not None
    assert options.next_heat_season.planning_date == date(2027, 5, 1)
