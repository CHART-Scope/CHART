"""Tests for district presets, offline fixtures, and viz helpers."""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")  # headless

import pytest

from era5_heat import PRESETS, fixture_demo
from era5_heat.cds_client import validate_bbox
from era5_heat.districts import get, list_slugs
from era5_heat.viz import monthly_heatmap, to_year_month_matrix


def test_presets_contain_focus_districts():
    slugs = list_slugs()
    assert "madhya-pradesh" in slugs
    assert "kajiado" in slugs


@pytest.mark.parametrize("slug", ["madhya-pradesh", "kajiado"])
def test_preset_bboxes_pass_validation(slug):
    preset = get(slug)
    validate_bbox(preset.bbox)            # no exception
    n, w, s, e = preset.bbox
    assert n > s
    assert -180 <= w < e <= 180


def test_kajiado_is_southern_hemisphere():
    n, _, s, _ = PRESETS["kajiado"].bbox
    assert n < 0 and s < 0
    assert n > s


def test_fixture_demo_returns_240_rows_for_20_years():
    df, meta = fixture_demo("madhya-pradesh", years=20, end_year=2024)
    assert len(df) == 240
    assert meta["window"]["start_year"] == 2005
    assert meta["window"]["end_year"] == 2024
    assert (df["tmax_monthly_max_c"] >= df["tmax_monthly_mean_c"]).all()


def test_fixture_demo_includes_handoff_metadata():
    df, meta = fixture_demo("kajiado", years=1, end_year=2024)
    expected = {
        "climate_source",
        "climate_dataset",
        "climate_source_version",
        "climate_variable",
        "data_status",
        "generated_at",
        "window_start_year",
        "window_end_year",
        "threshold_c",
        "min_run",
        "observed_days",
        "expected_days",
        "completeness_pct",
        "quality_flag",
    }
    assert expected.issubset(df.columns)
    assert set(df["data_status"]) == {"sample"}
    assert set(df["window_start_year"]) == {2024}
    assert set(df["window_end_year"]) == {2024}
    assert set(df["quality_flag"]) == {"complete"}
    assert meta["data_status"] == "sample"


def test_fixture_mp_hotter_than_kajiado():
    mp, _ = fixture_demo("madhya-pradesh", years=5, end_year=2024)
    kj, _ = fixture_demo("kajiado", years=5, end_year=2024)
    # Madhya Pradesh climate is configured hotter.
    assert mp["tmax_monthly_max_c"].mean() > kj["tmax_monthly_max_c"].mean()


def test_to_year_month_matrix_shape():
    df, _ = fixture_demo("madhya-pradesh", years=3, end_year=2024)
    mat = to_year_month_matrix(df, "heatwave_days")
    assert mat.shape == (3, 12)
    assert list(mat.columns) == [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    assert list(mat.index) == [2022, 2023, 2024]


def test_monthly_heatmap_returns_figure():
    df, _ = fixture_demo("kajiado", years=3, end_year=2024)
    fig = monthly_heatmap(df, value="tmax_monthly_max_c", title="t")
    assert fig is not None
    assert len(fig.axes) >= 1
