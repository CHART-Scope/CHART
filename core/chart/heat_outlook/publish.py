"""Turn the modelling team's Kenya tables into the files the dashboard reads.

The modeller's R scripts end in CSVs: one row per county, scenario, period,
calendar month and drop-down option. This script reshapes them into one
small JSON file per county and outcome, plus one national file. It can then
copy them to the model bucket, which ``chart-model-sync`` mirrors onto every
deployment under ``MODEL_CACHE_DIR``. Usage::

    chart-publish-kenya --lbw-dir ~/Downloads/.../LBW_.../model_files \\
        --u5-dir ~/Downloads/.../U5_.../model_files --upload

No model is evaluated here or at run time. The one derived number is the
3rd-trimester odds ratio, which is read off the modeller's own national
exposure-response curve (see ``_t3_odds_ratio``).
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
from collections import defaultdict
from pathlib import Path

from .service import (
    LBW_OUTCOME,
    U5_OUTCOME,
    county_slug,
    outlook_dir,
    outlook_release,
)

LBW_WINDOWS = ("P", "T1", "T2", "T3")
U5_SIDES = ("heat", "cool")


def publish(lbw_dir: Path, u5_dir: Path, out_dir: Path, release: str) -> list[Path]:
    written = [
        *_write_outcome(out_dir / LBW_OUTCOME, _lbw_documents(lbw_dir, release)),
        *_write_outcome(out_dir / U5_OUTCOME, _u5_documents(u5_dir, release)),
    ]
    return written


def _write_outcome(directory: Path, documents: dict[str, dict]) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    paths = []
    for slug, document in documents.items():
        path = directory / f"{slug}.json"
        path.write_text(json.dumps(document, separators=(",", ":")))
        paths.append(path)
    return paths


def _lbw_documents(source: Path, release: str) -> dict[str, dict]:
    model = json.loads((source / "lbw_tmax_dlnm_national_no_altitude.json").read_text())
    curve = _curve(source / "exposure_response_curves_by_window.csv", "T3")
    mmt = float(model["heat_reference_mmt"])
    header = {
        "outcome": LBW_OUTCOME,
        "release": release,
        "model_id": model["model_id"],
        "p0": model["p0"],
        "reference_temperature_c": round(mmt, 4),
        "selectors": [
            {"code": code, "label": label}
            for code, label in model["window_labels"].items()
        ],
    }

    months: dict[str, list] = defaultdict(list)
    by_key: dict[tuple, float] = {}
    rows = _read(source / "typical_month_heat_LBW_dlnm_county.csv")
    for row in rows:
        by_key[(row["county"], row["ssp"], row["period"], int(row["month"]))] = float(
            row["tmax"]
        )
    for row in rows:
        county, month = row["county"], int(row["month"])
        for window in LBW_WINDOWS:
            entry = {
                "scenario": row["ssp"],
                "period": row["period"],
                "selector": window,
                "side": "heat",
                "month": month,
                "tmax_c": _round(row["tmax"]),
                "mean": _round(row[f"af_heat_{window}_mean"]),
                "min": _round(row[f"af_heat_{window}_min"]),
                "max": _round(row[f"af_heat_{window}_max"]),
            }
            if window == "T3":
                hottest = max(
                    by_key[
                        (county, row["ssp"], row["period"], (month - lag - 1) % 12 + 1)
                    ]
                    for lag in model["windows"]["T3"]
                )
                entry["odds_ratio"] = _t3_odds_ratio(curve, hottest, mmt)
            months[county].append(entry)

    periods = _periods(
        _read(source / "PARP_heat_dlnm_county_by_period.csv"),
        value="parp",
        selector="window",
        side=lambda _row: "heat",
        p99="share_above_p99_pct",
        capped="share_capped_pct",
    )
    national = _periods(
        _read(source / "PARP_heat_dlnm_national_by_period.csv"),
        value="parp",
        selector="window",
        side=lambda _row: "heat",
        p99="share_above_p99_pct",
        capped="share_capped_pct",
    )
    return _documents(header, months, periods, national)


def _u5_documents(source: Path, release: str) -> dict[str, dict]:
    meta = json.loads((source / "u5_tmax_dlnm_models.json").read_text())
    header = {
        "outcome": U5_OUTCOME,
        "release": release,
        "model_id": meta["version"],
        "reference_temperature_c": None,
        "selectors": [
            {"code": code, "label": model["label"], "status": model["status"]}
            for code, model in meta["models"].items()
        ],
    }

    months: dict[str, list] = defaultdict(list)
    for row in _read(source / "typical_month_u5_county.csv"):
        for side in U5_SIDES:
            months[row["county"]].append(
                {
                    "scenario": row["ssp"],
                    "period": row["period"],
                    "selector": row["model"],
                    "side": side,
                    "month": int(row["month"]),
                    "tmax_c": _round(row["tmax"]),
                    "mean": _round(row[f"paf_{side}_mean"]),
                    "min": _round(row[f"paf_{side}_min"]),
                    "max": _round(row[f"paf_{side}_max"]),
                }
            )

    def keep(rows: list[dict]) -> list[dict]:
        return [row for row in rows if row["side"] in U5_SIDES]

    periods = _periods(
        keep(_read(source / "PAF_u5_county_by_period.csv")),
        value="paf",
        selector="model",
        side=lambda row: row["side"],
        p99="share_days_above_p99_pct",
        capped="share_days_capped_pct",
    )
    national = _periods(
        keep(_read(source / "PAF_u5_national_by_period.csv")),
        value="paf",
        selector="model",
        side=lambda row: row["side"],
        p99="share_days_above_p99_pct",
        capped="share_days_capped_pct",
    )
    return _documents(header, months, periods, national)


def _periods(rows, *, value, selector, side, p99, capped) -> dict[str, list]:
    out: dict[str, list] = defaultdict(list)
    for row in rows:
        out[row.get("county", "")].append(
            {
                "scenario": row["ssp"],
                "period": row["period"],
                "selector": row[selector],
                "side": side(row),
                "value_pct": _round(row[f"{value}_pct"]),
                "low_pct": _round(row[f"{value}_low"]),
                "high_pct": _round(row[f"{value}_high"]),
                "gcm_min_pct": _round(row["gcm_min"]),
                "gcm_max_pct": _round(row["gcm_max"]),
                "change_pp": _round(row["change_pct"]),
                "change_low_pp": _round(row["change_low"]),
                "change_high_pp": _round(row["change_high"]),
                "share_above_p99_pct": _round(row[p99]),
                "share_capped_pct": _round(row[capped]),
            }
        )
    return out


def _documents(header, months, periods, national) -> dict[str, dict]:
    documents = {
        county_slug(county): {
            **header,
            "level": "county",
            "place": county,
            "months": months[county],
            "periods": periods[county],
        }
        for county in sorted(months)
    }
    documents["kenya"] = {
        **header,
        "level": "country",
        "place": "Kenya",
        "months": [],
        "periods": national[""],
    }
    return documents


def _curve(path: Path, window: str) -> list[dict[str, float]]:
    points = [
        {key: float(row[key]) for key in ("tmax", "or", "or_low", "or_high")}
        for row in _read(path)
        if row["window"] == window
    ]
    return sorted(points, key=lambda point: point["tmax"])


def _t3_odds_ratio(curve: list[dict[str, float]], tmax: float, mmt: float) -> dict:
    """The national T3 curve at the hottest month of the trimester.

    The tables carry no per-county T3 odds ratio, and the display rule asks
    for one with its interval. The curve gives the odds ratio when every
    month of the window sits at one temperature; using the hottest of the
    three months is the worst case, which is the planning question. Months
    below the MMT count as the MMT (heat only), where the odds ratio is 1.
    """

    x = min(max(tmax, mmt), curve[-1]["tmax"])
    if x <= mmt:
        return {"value": 1.0, "low": 1.0, "high": 1.0, "at_tmax_c": round(tmax, 2)}
    upper = next(index for index, point in enumerate(curve) if point["tmax"] >= x)
    a, b = curve[max(upper - 1, 0)], curve[upper]
    share = 0.0 if b["tmax"] == a["tmax"] else (x - a["tmax"]) / (b["tmax"] - a["tmax"])

    def at(key: str) -> float:
        return round(a[key] + share * (b[key] - a[key]), 4)

    return {
        "value": at("or"),
        "low": at("or_low"),
        "high": at("or_high"),
        "at_tmax_c": round(tmax, 2),
    }


def _read(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def _round(value: str) -> float | None:
    return None if value in ("", "NA") else round(float(value), 5)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--lbw-dir", type=Path, required=True)
    parser.add_argument("--u5-dir", type=Path, required=True)
    parser.add_argument("--release", default=outlook_release())
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--bucket", default="chart-predictive-models")
    parser.add_argument("--upload", action="store_true")
    args = parser.parse_args(argv)

    out_dir = args.out or outlook_dir(args.release)
    written = publish(
        args.lbw_dir.expanduser(), args.u5_dir.expanduser(), out_dir, args.release
    )
    print(f"wrote {len(written)} files to {out_dir}")
    if args.upload:
        target = f"s3://{args.bucket}/kenya/outlook/{args.release}/"
        subprocess.run(
            ["aws", "s3", "sync", str(out_dir), target, "--delete"], check=True
        )
        print(f"uploaded to {target}")


if __name__ == "__main__":
    main()
