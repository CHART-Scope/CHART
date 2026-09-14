"""Tests for the RCP <-> SSP translation layer."""

from __future__ import annotations

import pytest

from chart.climate import scenarios


def test_rcp_labels_map_to_expected_ssp_pairs() -> None:
    assert scenarios.to_ssp("rcp26") == "ssp126"
    assert scenarios.to_ssp("rcp45") == "ssp245"
    assert scenarios.to_ssp("rcp60") == "ssp460"
    assert scenarios.to_ssp("rcp85") == "ssp585"


def test_ssp_pairs_translate_back_to_the_same_rcp() -> None:
    for rcp in ("rcp26", "rcp45", "rcp60", "rcp85"):
        ssp = scenarios.to_ssp(rcp)
        assert scenarios.to_rcp(ssp) == rcp


def test_unknown_rcp_label_raises_a_specific_error() -> None:
    with pytest.raises(scenarios.UnknownRcpLabel):
        scenarios.to_ssp("rcp99")


def test_unknown_ssp_identifier_raises_a_specific_error() -> None:
    with pytest.raises(scenarios.UnknownSspIdentifier):
        scenarios.to_rcp("ssp370")


def test_ssp_without_rcp_pair_falls_back_to_none_on_best_effort_lookup() -> None:
    assert scenarios.to_rcp_or_none("ssp370") is None
    assert scenarios.to_rcp_or_none("ssp126") == "rcp26"


def test_dashboard_long_term_rcps_matches_the_design_order() -> None:
    assert scenarios.DASHBOARD_LONG_TERM_RCPS == ("rcp26", "rcp45", "rcp60")


def test_is_known_rcp_true_for_supported_labels() -> None:
    assert scenarios.is_known_rcp("rcp26")
    assert not scenarios.is_known_rcp("rcp99")


def test_rcp_and_ssp_maps_are_read_only() -> None:
    with pytest.raises(TypeError):
        scenarios.RCP_TO_SSP["rcp99"] = "ssp999"  # type: ignore[index]
    with pytest.raises(TypeError):
        scenarios.SSP_TO_RCP["ssp999"] = "rcp99"  # type: ignore[index]
