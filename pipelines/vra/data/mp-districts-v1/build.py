"""Build the Madhya Pradesh district VRA upload from the reviewed source rows.

Reads ``../mp-divisions-v1/mp_districts_source.csv`` (NFHS-5 2019-21 district
fact sheets, Census of India 2011, NITI Aayog MPI: one row per district and
indicator, as extracted and spot-checked for the division file) and
``chart_districts.csv`` (CHART's 52 districts: the boundary release's place
codes, exported from the sandbox), and writes ``mp_districts_vra.csv`` in the
VRA upload format, one row per district and indicator, values as published.

- District names are matched to CHART's, with the renames in ``RENAMES``.
- A district the sources do not cover (Niwari, formed in 2018) gets no rows:
  it stays missing rather than taking a neighbour's or its parent's value.
- ``HELD_BACK`` indicators are not written until their definition is settled
  (NFHS reports water and sanitation per person; the catalogue says per
  household).

    python pipelines/vra/data/mp-districts-v1/build.py
"""

from __future__ import annotations

import csv
from pathlib import Path

HERE = Path(__file__).parent
SOURCE = HERE.parent / "mp-divisions-v1" / "mp_districts_source.csv"
DIVISION_FILE = HERE.parent / "mp-divisions-v1" / "mp_divisions_vra.csv"
RENAMES = {
    "Khandwa": "East Nimar",
    "Khargone": "West Nimar",
    "Narsinghpur": "Narsimhapur",
}
HELD_BACK = {"ac.improved_water_source", "ac.improved_sanitation"}
COLUMNS = [
    "area_code", "area_name", "indicator_code", "value", "vintage",
    "source_name", "source_url", "notes",
]  # fmt: skip


def main() -> None:
    chart = {
        row["name"].lower(): row
        for row in csv.DictReader((HERE / "chart_districts.csv").open())
    }
    # Each indicator's source name and URL, as reviewed for the division file.
    sources = {}
    for row in csv.DictReader(DIVISION_FILE.open()):
        sources.setdefault(
            row["indicator_code"], (row["source_name"], row["source_url"])
        )
    out = []
    unmatched = set()
    for row in csv.DictReader(SOURCE.open()):
        if row["indicator_code"] in HELD_BACK or not row["value"].strip():
            continue
        name = RENAMES.get(row["district"], row["district"])
        place = chart.get(name.lower())
        if place is None:
            unmatched.add(row["district"])
            continue
        source_name, source_url = sources[row["indicator_code"]]
        out.append(
            [
                place["area_code"],
                place["name"],
                row["indicator_code"],
                row["value"],
                row["vintage"],
                source_name,
                source_url,
                "district value as published"
                + (
                    f" (source name {row['district']})"
                    if name != row["district"]
                    else ""
                ),
            ]
        )
    if unmatched:
        raise SystemExit(f"districts not matched to CHART: {sorted(unmatched)}")
    out.sort(key=lambda r: (r[1], r[2]))
    with (HERE / "mp_districts_vra.csv").open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows(out)
    covered = {r[0] for r in out}
    missing = sorted(p["name"] for p in chart.values() if p["area_code"] not in covered)
    print(
        f"{len(out)} rows, {len(covered)} districts, {len({r[2] for r in out})} indicators"
    )
    print(f"no source rows: {missing}")


if __name__ == "__main__":
    main()
