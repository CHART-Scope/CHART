from chart.climate.what_if import (
    _odds_ratio_to_percent,
    _relative_odds_change_percent,
)


def test_relative_odds_change_preserves_associations_below_one() -> None:
    assert _relative_odds_change_percent(0.62) == -38.0
    assert _relative_odds_change_percent(1.0) == 0.0
    assert _relative_odds_change_percent(1.25) == 25.0


def test_attributable_fraction_remains_positive_excess_only() -> None:
    assert _odds_ratio_to_percent(0.62) == 0.0
    assert _odds_ratio_to_percent(1.25) == 20.0
