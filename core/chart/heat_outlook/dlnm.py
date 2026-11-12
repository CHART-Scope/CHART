"""Score the Kenya DLNM models on any temperature, without R.

A port of the modelling team's reference implementations
(``lbw_heat_risk_dlnm.py`` and ``u5_temp_risk_dlnm.py`` in the 2026-10-06
hand-over) to plain Python, so the API needs no numpy. Each model ships as its
coefficients and covariance plus a lookup of the cross-basis evaluated on a
0.1 deg C grid per lag; a month (or day) is scored by interpolating the basis
at each lag's temperature, summing over the lags and taking the linear
predictor and its standard error. ``core/tests/test_kenya_observed_api.py``
checks the port against the modeller's validation cases from R.

Temperatures must be on the scale the models were fitted on; see
``observed.py`` for how ERA5 is moved onto it.
"""

from __future__ import annotations

import csv
import json
import math
from bisect import bisect_right
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

RELEASES_DIR = Path(__file__).parent / "releases"


@dataclass(frozen=True)
class Basis:
    """One model's cross-basis lookup: ``rows[lag][i]`` is the basis at ``grid[i]``."""

    grid: tuple[float, ...]
    rows: dict[int, tuple[tuple[float, ...], ...]]

    def at(self, lag: int, tmax: float) -> list[float]:
        """Linear interpolation on the grid; outside it the end value holds."""

        grid, rows = self.grid, self.rows[lag]
        x = min(max(tmax, grid[0]), grid[-1])
        upper = min(max(bisect_right(grid, x), 1), len(grid) - 1)
        lower = upper - 1
        span = grid[upper] - grid[lower]
        weight = 0.0 if span == 0 else (x - grid[lower]) / span
        return [
            low + (high - low) * weight
            for low, high in zip(rows[lower], rows[upper], strict=True)
        ]


@dataclass(frozen=True)
class Model:
    coef: tuple[float, ...]
    vcov: tuple[tuple[float, ...], ...]
    basis: Basis

    def predictor(self, g: list[float]) -> tuple[float, float]:
        """The log ratio and its standard error for a summed basis ``g``."""

        eta = sum(gi * bi for gi, bi in zip(g, self.coef, strict=True))
        variance = sum(
            gi * sum(vij * gj for vij, gj in zip(row, g, strict=True))
            for gi, row in zip(g, self.vcov, strict=True)
        )
        return eta, math.sqrt(max(variance, 0.0))


@dataclass(frozen=True)
class Score:
    """One scored month (LBW) or day (under-five)."""

    log_ratio: float
    se: float

    @property
    def ratio(self) -> float:
        return math.exp(self.log_ratio)

    @property
    def ratio_low(self) -> float:
        return math.exp(self.log_ratio - 1.96 * self.se)

    @property
    def ratio_high(self) -> float:
        return math.exp(self.log_ratio + 1.96 * self.se)


@dataclass(frozen=True)
class LbwModel:
    model: Model
    meta: dict

    @property
    def mmt(self) -> float:
        return float(self.meta["heat_reference_mmt"])

    @property
    def p0(self) -> float:
        return float(self.meta["p0"])

    def lags(self, window: str) -> list[int]:
        return [int(lag) for lag in self.meta["windows"][window]]

    def score(self, tmax_by_lag: list[float], window: str) -> Score:
        """``tmax_by_lag[k]``: monthly mean Tmax ``k`` months before the birth month.

        Heat only, as in the reference: a month cooler than the minimum-risk
        temperature counts as that temperature, so it adds nothing.
        """

        g = [0.0] * len(self.model.coef)
        for lag in self.lags(window):
            x = max(tmax_by_lag[lag], self.mmt)
            g = [a + b for a, b in zip(g, self.model.basis.at(lag, x), strict=True)]
        return Score(*self.model.predictor(g))


@dataclass(frozen=True)
class U5Models:
    models: dict[str, Model]
    meta: dict

    @property
    def lags(self) -> list[int]:
        return [int(lag) for lag in self.meta["lags"]]

    def score(
        self, tmax_by_lag: list[float], ref_tmax: float, name: str, side: str
    ) -> Score:
        """``tmax_by_lag[k]``: daily Tmax ``k`` days before the day of death.

        Relative to ``ref_tmax`` (the area's 1991-2020 mean daily Tmax): the
        heat side counts lag days above it, the cool side days below it.
        """

        model = self.models[name]
        g = [0.0] * len(model.coef)
        for lag in self.lags:
            day = tmax_by_lag[lag]
            x = max(day, ref_tmax) if side == "heat" else min(day, ref_tmax)
            here, ref = model.basis.at(lag, x), model.basis.at(lag, ref_tmax)
            g = [a + b - c for a, b, c in zip(g, here, ref, strict=True)]
        return Score(*model.predictor(g))


def or_to_rr(odds_ratio: float, p0: float) -> float:
    """Zhang & Yu (1998), as in the LBW reference implementation."""

    return odds_ratio / ((1 - p0) + p0 * odds_ratio)


def release_dir(release: str) -> Path:
    return RELEASES_DIR / release


@lru_cache(maxsize=4)
def lbw_model(release: str) -> LbwModel:
    directory = release_dir(release)
    meta = json.loads((directory / "lbw_model.json").read_text())
    basis = _basis(directory / "lbw_basis_lookup.csv", meta["coef_names"])
    return LbwModel(model=_model(meta, basis), meta=meta)


@lru_cache(maxsize=4)
def u5_models(release: str) -> U5Models:
    directory = release_dir(release)
    meta = json.loads((directory / "u5_models.json").read_text())
    with (directory / "u5_basis_lookup.csv").open() as handle:
        rows = list(csv.DictReader(handle))
    models = {
        name: _model(
            spec,
            _basis_rows(
                [row for row in rows if row["model"] == name], meta["coef_names"]
            ),
        )
        for name, spec in meta["models"].items()
    }
    return U5Models(models=models, meta=meta)


def _model(spec: dict, basis: Basis) -> Model:
    return Model(
        coef=tuple(float(value) for value in spec["coef"]),
        vcov=tuple(tuple(float(value) for value in row) for row in spec["vcov"]),
        basis=basis,
    )


def _basis(path: Path, coef_names: list[str]) -> Basis:
    with path.open() as handle:
        return _basis_rows(list(csv.DictReader(handle)), coef_names)


def _basis_rows(rows: list[dict], coef_names: list[str]) -> Basis:
    by_lag: dict[int, list[tuple[float, tuple[float, ...]]]] = {}
    for row in rows:
        by_lag.setdefault(int(row["lag"]), []).append(
            (float(row["tmax"]), tuple(float(row[name]) for name in coef_names))
        )
    for values in by_lag.values():
        values.sort(key=lambda item: item[0])
    grid = tuple(tmax for tmax, _ in next(iter(by_lag.values())))
    return Basis(
        grid=grid,
        rows={
            lag: tuple(basis for _, basis in values) for lag, values in by_lag.items()
        },
    )
