"""Matplotlib visualizations for the monthly Tmax / heatwave-day frame.

Designed to be called from a Jupyter notebook (the figure is returned
so the notebook can display it) or from the CLI (via `save_figure`).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def to_year_month_matrix(df: pd.DataFrame, value: str) -> pd.DataFrame:
    """Pivot a monthly frame into a year x month matrix for heatmap plotting."""
    if value not in df.columns:
        raise KeyError(f"{value!r} not in DataFrame columns {list(df.columns)}")
    months = pd.to_datetime(df["month"])
    pivot = (
        pd.DataFrame({
            "year": months.dt.year,
            "month": months.dt.month,
            "v": df[value].to_numpy(),
        })
        .pivot(index="year", columns="month", values="v")
        .reindex(columns=range(1, 13))
        .sort_index()
    )
    pivot.columns = _MONTHS
    return pivot


def _cmap_and_label(value: str) -> tuple[str, str]:
    if value == "heatwave_days":
        return "magma", "Heatwave days"
    if value == "tmax_monthly_max_c":
        return "inferno", "Monthly absolute Tmax (°C)"
    if value == "tmax_monthly_mean_c":
        return "inferno", "Mean of daily Tmax (°C)"
    return "viridis", value


def monthly_heatmap(
    df: pd.DataFrame,
    value: str = "heatwave_days",
    title: str | None = None,
    figsize: tuple[float, float] | None = None,
):
    """Render a year x month heatmap. Returns a matplotlib Figure."""
    import matplotlib.pyplot as plt  # imported lazily so the library is optional

    mat = to_year_month_matrix(df, value)
    cmap, cbar_label = _cmap_and_label(value)

    n_years = max(len(mat.index), 1)
    figsize = figsize or (8.5, max(3.5, 0.32 * n_years + 1.2))
    fig, ax = plt.subplots(figsize=figsize)

    arr = mat.to_numpy(dtype="float64")
    im = ax.imshow(arr, aspect="auto", cmap=cmap, interpolation="nearest")

    ax.set_xticks(range(12))
    ax.set_xticklabels(mat.columns)
    ax.set_yticks(range(len(mat.index)))
    ax.set_yticklabels(mat.index)
    ax.set_xlabel("Month")
    ax.set_ylabel("Year")

    if title:
        ax.set_title(title)

    # Annotate small grids so values are readable; skip if too big.
    if arr.size <= 20 * 12:
        finite = arr[np.isfinite(arr)]
        if finite.size:
            mid = (finite.min() + finite.max()) / 2.0
            for y in range(arr.shape[0]):
                for x in range(arr.shape[1]):
                    v = arr[y, x]
                    if not np.isfinite(v):
                        continue
                    text = f"{v:.0f}" if value == "heatwave_days" else f"{v:.1f}"
                    ax.text(
                        x, y, text, ha="center", va="center",
                        color="white" if v >= mid else "black", fontsize=7,
                    )

    cb = fig.colorbar(im, ax=ax, shrink=0.85)
    cb.set_label(cbar_label)
    fig.tight_layout()
    return fig


def save_figure(fig, path: Path, dpi: int = 150) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=dpi, bbox_inches="tight")
    return path
