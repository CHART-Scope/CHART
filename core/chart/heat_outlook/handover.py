"""Publish the October 2026 modeller handovers without changing their source files.

Run with the optional ``handover`` dependencies installed. Output is a local,
versioned data cache, never model source code. New countries/levels require a
Package mapping and geography records, not new database columns.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

RELEASE = "2026-10-22"
LBW = "lbw"
U5 = "under_5_mortality"
START_YEARS = (2027, *range(2031, 2097, 5))
SCENARIOS = ("ssp126", "ssp370", "ssp585")
NOTE = (
    "Published area tables retain the modeller's estimates and coefficient intervals. "
    "Additional periods use original approximately 0.5-degree projection grids: "
    "equal-month temporal averages and polygon-intersection area weights, separately "
    "for each climate model before calculating the ensemble mean and range. "
    "These grid estimates can differ from the area tables; they are not population "
    "weighted or downscaled. Coefficient confidence intervals and temperature summaries "
    "are unavailable for derived periods. Negative estimates are retained for audit "
    "but must not be displayed as attributable burden."
)


@dataclass(frozen=True)
class Package:
    country: str
    root_id: str
    root_name: str
    root_level: str
    leaf_level: str
    middle_level: str
    prefix: str


PACKAGES = (
    Package(
        "IN",
        "geo-in-madhya-pradesh",
        "Madhya Pradesh",
        "state",
        "district",
        "division",
        "Madhya_Pradesh",
    ),
    Package("KE", "geo-ke", "Kenya", "country", "constituency", "county", "Kenya"),
)


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower().replace("'", "")).strip("-")


def geography_id(package: Package, level: str, name: str) -> str:
    if level == package.root_level:
        return package.root_id
    if package.country == "KE" and level == "county":
        return f"geo-ke-{slug(name)}"
    return f"{package.root_id}-{level}-{slug(name)}"


def _sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as source:
        return list(csv.DictReader(source))


def number(value) -> float | None:
    if value is None or value == "":
        return None
    result = float(value)
    return round(result, 7) if math.isfinite(result) else None


def _source(root: Path, package: Package, outcome: str) -> Path:
    prefix = "LBW" if outcome == LBW else "U5"
    matches = [p for p in root.glob(f"{prefix}*{package.prefix}*") if p.is_dir()]
    if len(matches) != 1:
        raise ValueError(
            f"Expected one {prefix} {package.prefix} package, got {matches}"
        )
    return matches[0]


def _geographies(source: Path, package: Package):
    import geopandas as gpd
    from shapely import union_all

    boundary_kind = "district" if package.country == "IN" else "constituenc"
    shape_path = next(
        path
        for path in (source / "gridded_projections").rglob("*.shp")
        if boundary_kind in path.stem.lower()
    )
    frame = gpd.read_file(shape_path).to_crs(4326)
    name_key, parent_key = (
        ("dist_name", "div_name")
        if package.country == "IN"
        else ("const_name", "cnty_name")
    )
    geometries, entries = {}, {}
    for _, row in frame.iterrows():
        name, parent = row[name_key], row[parent_key]
        gid = geography_id(package, package.leaf_level, name)
        if gid in entries:
            raise ValueError(f"Duplicate geography {gid}")
        geometry = row.geometry
        if geometry.is_empty or not geometry.is_valid:
            raise ValueError(f"Invalid supplied boundary: {name}")
        geometries[gid] = geometry
        entries[gid] = dict(
            country_code=package.country,
            level=package.leaf_level,
            place=name,
            parent_id=geography_id(package, package.middle_level, parent),
            external_code=str(row["area_id"]),
            outcomes=[],
            release=RELEASE,
        )
    for name in sorted(set(frame[parent_key])):
        gid = geography_id(package, package.middle_level, name)
        geometries[gid] = union_all(frame.loc[frame[parent_key] == name].geometry)
        entries[gid] = dict(
            country_code=package.country,
            level=package.middle_level,
            place=name,
            parent_id=package.root_id,
            outcomes=[],
            release=RELEASE,
        )
    geometries[package.root_id] = union_all(frame.geometry)
    entries[package.root_id] = dict(
        country_code=package.country,
        level=package.root_level,
        place=package.root_name,
        parent_id="geo-in" if package.country == "IN" else None,
        outcomes=[],
        release=RELEASE,
    )
    expected = 52 if package.country == "IN" else 289
    if len(frame) != expected:
        raise ValueError(
            f"Expected {expected} {package.leaf_level} boundaries, got {len(frame)}"
        )
    return geometries, entries, shape_path


def _header(source: Path, package: Package, outcome: str) -> dict:
    model_path = next(
        (source / "model_files").glob(
            "lbw_tmax*.json" if outcome == LBW else "u5_tmax*.json"
        )
    )
    model = json.loads(model_path.read_text())
    if outcome == LBW:
        selectors = [
            {"code": code, "label": label}
            for code, label in model["window_labels"].items()
        ]
    else:
        selectors = [
            {
                "code": code,
                "label": value["label"],
                "status": value.get("status", "exploratory"),
            }
            for code, value in model["models"].items()
            if "|" not in code
        ]
    if outcome == U5 and model.get("division_curves"):
        selectors.extend(
            {
                "code": code + "_div",
                "label": label + " (division curve)",
                "status": "exploratory",
            }
            for code, label in (("neonatal", "Neonatal"), ("under5", "Under-five"))
        )
    caveat = model.get("caveat", "")
    if outcome == U5 and package.country == "IN":
        caveat = "The MP mortality models show no statistically significant overall temperature association; estimates are exploratory."
    return dict(
        caveat=caveat,
        outcome=outcome,
        release=RELEASE,
        country_code=package.country,
        model_id=model.get("model_id", model.get("version")),
        p0=model.get("p0"),
        reference_temperature_c=model.get("heat_reference_mmt"),
        selectors=selectors,
        default_selector="P" if outcome == LBW else "neonatal",
        data_modes=["projection"],
        baseline_period="1981-2010" if outcome == LBW else "1991-2020",
        metadata_note=NOTE,
        source_note=source.name,
        source_uri=f"handover://{source.name}",
        model_scope="state" if package.country == "IN" else "national",
    )


def _tables(source: Path, package: Package, outcome: str, documents: dict) -> None:
    for path in sorted((source / "model_files").glob("*.csv")):
        is_period = path.name.endswith("_by_period.csv") and path.name.startswith(
            ("PARP_", "PAF_")
        )
        if not is_period and not path.name.startswith("typical_month_"):
            continue
        for row in read_csv(path):
            level = next(
                (
                    key
                    for key in (package.leaf_level, package.middle_level)
                    if row.get(key)
                ),
                package.root_level,
            )
            gid = geography_id(package, level, row.get(level, package.root_name))
            if gid not in documents:
                raise ValueError(f"Table geography missing supplied boundary: {gid}")
            doc = documents[gid]
            if is_period:
                value = "parp" if outcome == LBW else "paf"
                selector = row["window"] if outcome == LBW else row["model"]
                if "|" in selector:
                    continue
                entry = dict(
                    scenario=row["ssp"],
                    period=row["period"],
                    selector=selector,
                    side="heat" if outcome == LBW else row["side"],
                    source="published_area_table",
                )
                for target, key in {
                    "value_pct": f"{value}_pct",
                    "low_pct": f"{value}_low",
                    "high_pct": f"{value}_high",
                    "gcm_min_pct": "gcm_min",
                    "gcm_max_pct": "gcm_max",
                    "change_pp": "change_pct",
                    "change_low_pp": "change_low",
                    "change_high_pp": "change_high",
                    "share_above_p90_pct": "share_above_p90_pct",
                    "share_above_p99_pct": "share_days_above_p99_pct",
                    "share_capped_pct": (
                        "share_capped_pct"
                        if outcome == LBW
                        else "share_days_capped_pct"
                    ),
                }.items():
                    entry[target] = number(row.get(key))
                doc["periods"].append(entry)
            else:
                selections = (
                    [
                        (code, "heat", f"af_heat_{code}")
                        for code in ("P", "T1", "T2", "T3")
                    ]
                    if outcome == LBW
                    else [
                        (row["model"], side, f"paf_{side}")
                        for side in ("heat", "cool", "total")
                    ]
                )
                for selector, side, prefix in selections:
                    if "|" in selector:
                        continue
                    doc["months"].append(
                        dict(
                            scenario=row["ssp"],
                            period=row["period"],
                            selector=selector,
                            side=side,
                            month=int(row["month"]),
                            tmax_c=number(row["tmax"]),
                            mean=number(row[f"{prefix}_mean"]),
                            min=number(row[f"{prefix}_min"]),
                            max=number(row[f"{prefix}_max"]),
                            source="published_area_table",
                        )
                    )


def _weights(dataset, geometries):
    """Intersection areas in an equal-area CRS; exclude masked cells per variable."""
    import numpy as np
    from pyproj import Transformer
    from shapely.geometry import box
    from shapely.ops import transform

    lat, lon = dataset.latitude.values, dataset.longitude.values
    dy, dx = abs(float(lat[1] - lat[0])), abs(float(lon[1] - lon[0]))
    project = Transformer.from_crs(4326, 6933, always_xy=True).transform
    cells = [
        box(x - dx / 2, y - dy / 2, x + dx / 2, y + dy / 2) for y in lat for x in lon
    ]
    weights = []
    for geometry in geometries.values():
        pairs = [
            (i, transform(project, geometry.intersection(cell)).area)
            for i, cell in enumerate(cells)
            if geometry.intersects(cell)
        ]
        pairs = [(i, area) for i, area in pairs if area > 0]
        if not pairs:
            raise ValueError("Boundary has no intersecting projection cells")
        weights.append(
            (np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs]))
        )
    return weights


def _spatial(values, weights):
    import numpy as np

    flat = values.reshape((values.shape[0], -1))
    columns = []
    for indices, areas in weights:
        selected = flat[:, indices]
        denominator = np.sum(np.isfinite(selected) * areas, axis=1)
        columns.append(
            np.divide(
                np.nansum(selected * areas, axis=1),
                denominator,
                out=np.full(len(flat), np.nan),
                where=denominator > 0,
            )
        )
    return np.stack(columns, axis=1)


def _grids(
    source: Path,
    outcome: str,
    geometries: dict,
    documents: dict,
    start_years: tuple[int, ...],
) -> None:
    import numpy as np
    import xarray as xr

    # Future downscaling belongs upstream of this grid-to-area adapter. Supply a
    # separately validated, versioned monthly grid and retain its resolution and
    # calibration provenance; changing a polygon must not imply finer climate data.
    sample = next(iter(documents.values()))
    baseline = sample["baseline_period"]
    period_set = {baseline, "2021-2040", "2041-2060", "2061-2080", "2081-2100"}
    period_set.update(
        f"{year}-{year+length-1}"
        for year in start_years
        for length in (5, 10, 20)
        if year + length - 1 <= 2100
    )
    periods = sorted(period_set)
    fields = [
        (selector["code"], side)
        for selector in sample["selectors"]
        for side in (("heat",) if outcome == LBW else ("heat", "cool", "total"))
    ]
    ids = list(geometries)
    weights = None
    baseline_fields = {}
    if outcome == U5:
        baseline_path = next((source / "gridded_projections/Baseline").glob("*.nc"))
        with xr.open_dataset(baseline_path) as observed:
            if list(observed.time.dt.month.values) != list(range(1, 13)):
                raise ValueError("Observed baseline must contain all calendar months")
            baseline_fields = {
                name: observed[name].transpose("time", "latitude", "longitude").values
                for name in observed.data_vars
                if str(name).startswith("af_")
            }
    for scenario in SCENARIOS:
        files = sorted(
            (source / "gridded_projections/Monthly").glob(f"*_{scenario}_*.nc")
        )
        if len(files) != 5:
            raise ValueError(f"Expected five climate models for {scenario}: {source}")
        aggregated = []
        for path in files:
            with xr.open_dataset(path) as dataset:
                if weights is None:
                    weights = _weights(dataset, geometries)
                years, months = (
                    dataset.time.dt.year.values,
                    dataset.time.dt.month.values,
                )
                masks = []
                for period in periods:
                    lo, hi = map(int, period.split("-"))
                    mask = (years >= lo) & (years <= hi)
                    if int(mask.sum()) != (hi - lo + 1) * 12:
                        raise ValueError(
                            f"Incomplete monthly coverage: {path.name} {period}"
                        )
                    masks.extend([mask, *(mask & (months == m) for m in range(1, 13))])
                results = []
                for selector, side in fields:
                    variable = (
                        f"af_mmt_{selector}"
                        if outcome == LBW
                        else f"af_{side}_{selector}"
                    )
                    series = _spatial(
                        dataset[variable]
                        .transpose("time", "latitude", "longitude")
                        .values,
                        weights,
                    )
                    change_variable = (
                        f"af_change_{selector}"
                        if outcome == LBW
                        else f"change_{side}_{selector}"
                    )
                    if change_variable in dataset:
                        change = _spatial(
                            dataset[change_variable]
                            .transpose("time", "latitude", "longitude")
                            .values,
                            weights,
                        )
                    else:
                        # U5 cool-change grids are absent. Use the supplied observed
                        # calendar-month baseline, never a GCM historical average.
                        reference = _spatial(baseline_fields[variable], weights)
                        change = series - reference[months - 1]
                    result = np.stack(
                        [
                            np.stack([arr[mask].mean(axis=0) for mask in masks])
                            for arr in (series, change)
                        ]
                    )
                    if outcome == U5:
                        reference = _spatial(baseline_fields[variable], weights)
                        offset = periods.index(baseline) * 13
                        result[0, offset : offset + 13] = np.concatenate(
                            [reference.mean(axis=0, keepdims=True), reference]
                        )
                        result[1, offset : offset + 13] = 0
                    results.append(result)
                aggregated.append(np.stack(results))
        ensemble = np.stack(aggregated)  # GCM, field, value/change, period/month, area
        means, lows, highs = (
            ensemble.mean(axis=0),
            ensemble.min(axis=0),
            ensemble.max(axis=0),
        )
        for area, gid in enumerate(ids):
            doc = documents[gid]
            existing = {
                (row["scenario"], row["period"], row["selector"], row["side"])
                for row in doc["periods"]
            }
            existing_months = {
                (row["scenario"], row["period"], row["selector"], row["side"])
                for row in doc["months"]
            }
            for field, (selector, side) in enumerate(fields):
                for pi, period in enumerate(periods):
                    index = pi * 13
                    mean = number(means[field, 0, index, area])
                    if mean is None:
                        continue  # No finite grid coverage; never invent nearest-cell results.
                    key = (scenario, period, selector, side)
                    if key not in existing:
                        doc["periods"].append(
                            dict(
                                scenario=scenario,
                                period=period,
                                selector=selector,
                                side=side,
                                value_pct=number(100 * means[field, 0, index, area]),
                                low_pct=None,
                                high_pct=None,
                                gcm_min_pct=number(100 * lows[field, 0, index, area]),
                                gcm_max_pct=number(100 * highs[field, 0, index, area]),
                                change_pp=number(100 * means[field, 1, index, area]),
                                change_low_pp=None,
                                change_high_pp=None,
                                share_above_p90_pct=None,
                                share_above_p99_pct=None,
                                share_capped_pct=None,
                                source="area_weighted_monthly_grid",
                                n_gcm=5,
                            )
                        )
                    if key not in existing_months:
                        for month in range(1, 13):
                            ix = index + month
                            doc["derived_months"].append(
                                [
                                    scenario,
                                    period,
                                    selector,
                                    side,
                                    month,
                                    number(means[field, 0, ix, area]),
                                    number(lows[field, 0, ix, area]),
                                    number(highs[field, 0, ix, area]),
                                    number(means[field, 1, ix, area]),
                                ]
                            )
        print(f"  {source.name}: {scenario} aggregated", flush=True)


def publish(
    source: Path, output: Path, *, start_years: tuple[int, ...] = START_YEARS
) -> dict:
    from shapely.geometry import mapping

    output.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict] = {
        "geo-in": dict(
            country_code="IN",
            level="country",
            place="India",
            parent_id=None,
            outcomes=[],
            release=RELEASE,
        )
    }
    features: list[dict] = []
    provenance: list[dict] = []
    for package in PACKAGES:
        lbw_source = _source(source, package, LBW)
        geometries, entries, shape_path = _geographies(lbw_source, package)
        for gid, geometry in geometries.items():
            features.append(
                dict(
                    type="Feature",
                    properties={
                        "geography_id": gid,
                        "external_code": entries[gid].get("external_code"),
                    },
                    geometry=mapping(geometry),
                )
            )
        for outcome in (LBW, U5):
            directory = _source(source, package, outcome)
            header = _header(directory, package, outcome)
            documents = {
                gid: {
                    **header,
                    "geography_id": gid,
                    "level": value["level"],
                    "place": value["place"],
                    "months": [],
                    "periods": [],
                    "derived_months": [],
                }
                for gid, value in entries.items()
            }
            _tables(directory, package, outcome, documents)
            _grids(directory, outcome, geometries, documents, start_years)
            for gid, document in documents.items():
                if not document["periods"]:
                    continue
                destination = output / gid / f"{outcome}.json"
                destination.parent.mkdir(exist_ok=True)
                temporary = destination.with_suffix(".tmp")
                temporary.write_text(
                    json.dumps(document, separators=(",", ":"), allow_nan=False)
                )
                temporary.replace(destination)
                entries[gid]["outcomes"].append(outcome)
            inputs = sorted(
                [
                    *(directory / "model_files").glob("*.csv"),
                    *(directory / "model_files").glob("*.json"),
                    *(directory / "gridded_projections/Monthly").glob("*.nc"),
                    *(directory / "gridded_projections/Baseline").glob("*.nc"),
                ]
            )
            provenance.extend(
                {
                    "source": str(p.relative_to(source)),
                    "sha256": _sha256(p),
                }
                for p in inputs
            )
        index.update(entries)
        provenance.append(
            {
                "source": str(shape_path.relative_to(source)),
                "sha256": _sha256(shape_path),
            }
        )
    (output / "boundaries.json").write_text(
        json.dumps(
            dict(type="FeatureCollection", features=features), separators=(",", ":")
        )
    )
    (output / "provenance.json").write_text(
        json.dumps(
            dict(
                release=RELEASE, method=NOTE, start_years=start_years, inputs=provenance
            ),
            indent=2,
        )
    )
    temporary = output / "index.tmp"
    temporary.write_text(json.dumps(index, indent=2))
    temporary.replace(output / "index.json")
    return index


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, required=True, help="Extracted handover parent directory"
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="MODEL_CACHE_DIR/outlooks"
    )
    parser.add_argument("--start-years", type=int, nargs="+", default=START_YEARS)
    args = parser.parse_args()
    if any(year < 2021 or year > 2096 for year in args.start_years):
        parser.error("Start years must be between 2021 and 2096")
    index = publish(
        args.source.expanduser(),
        args.output.expanduser(),
        start_years=tuple(args.start_years),
    )
    print(f"Published {len(index)} geographies to {args.output}")


if __name__ == "__main__":
    main()
