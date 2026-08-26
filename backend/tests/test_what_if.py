from chart.climate.what_if import (
    _odds_ratio_to_percent,
    _relative_odds_change_percent,
)


def test_relative_odds_change_preserves_associations_below_one() -> None:
    assert _relative_odds_change_percent(0.62) == -38.0
    assert _relative_odds_change_percent(1.0) == 0.0
    assert _relative_odds_change_percent(1.25) == 25.0


def test_relative_odds_change_honors_positive_excess_only_policy() -> None:
    # When the manifest declares the exposure-response is only interpreted
    # above the reference, the *below-reference* tail is out of scope — the
    # signed "X% lower" reading is suppressed there.
    spec = {"output_contract": {"attributable_fraction": "positive_excess_only"}}
    assert (
        _relative_odds_change_percent(
            0.62, spec, temperature_c=22.0, reference_temperature_c=27.0
        )
        == 0.0
    )
    # Above-reference readings are always reported at full precision, even
    # when the block's own spline returns OR<1 (small-sample division fit
    # instability). Hiding this would misrepresent what the model computed.
    assert (
        _relative_odds_change_percent(
            0.5, spec, temperature_c=38.5, reference_temperature_c=27.0
        )
        == -50.0
    )
    assert (
        _relative_odds_change_percent(
            1.25, spec, temperature_c=35.0, reference_temperature_c=27.0
        )
        == 25.0
    )
    # No temperature context or missing policy → raw signed behavior.
    assert _relative_odds_change_percent(0.62) == -38.0
    assert _relative_odds_change_percent(0.62, spec) == -38.0
    assert (
        _relative_odds_change_percent(
            0.62,
            {"output_contract": {"attributable_fraction": "signed"}},
            temperature_c=22.0,
            reference_temperature_c=27.0,
        )
        == -38.0
    )


def test_attributable_fraction_remains_positive_excess_only() -> None:
    assert _odds_ratio_to_percent(0.62) == 0.0
    assert _odds_ratio_to_percent(1.25) == 20.0
