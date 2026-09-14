"""CLI entrypoint: `python -m era5_heat ...`."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from . import compute_heat_series
from .districts import PRESETS, list_slugs
from .io import output_paths, write_json, write_table


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="era5_heat",
        description=(
            "Download ERA5 2m_temperature for a district bbox and write a "
            "monthly Tmax + heatwave-day table."
        ),
    )
    target = p.add_mutually_exclusive_group(required=True)
    target.add_argument(
        "--preset", choices=list_slugs(),
        help="Use a built-in district preset (sets --district and --bbox).",
    )
    target.add_argument("--district", help="District label (free text).")
    p.add_argument(
        "--bbox", nargs=4, type=float, metavar=("N", "W", "S", "E"),
        help="Bounding box as four floats: north west south east (degrees). "
             "Required unless --preset is used.",
    )
    p.add_argument("--years", type=int, default=20, help="Number of years (default 20).")
    p.add_argument(
        "--end-year", type=int, default=None,
        help="Last calendar year to include (default: last completed year).",
    )
    p.add_argument("--threshold-c", type=float, default=35.0)
    p.add_argument("--min-run", type=int, default=3)
    p.add_argument(
        "--outdir", type=Path,
        default=Path("outputs") / "era5_heat",
        help="Output directory (default: outputs/era5_heat relative to the current working directory).",
    )
    p.add_argument(
        "--format",
        choices=["csv", "parquet"],
        default="csv",
        help="Tabular output format (default: csv). Use parquet only with a working pyarrow install.",
    )
    p.add_argument(
        "--cache-dir", type=Path, default=None,
        help="NetCDF cache directory (default: pipelines/era5_heat/.cache).",
    )
    p.add_argument("--no-cache", action="store_true")
    p.add_argument("--refresh", action="store_true", help="Re-download even if cached.")
    p.add_argument("--max-workers", type=int, default=3)
    p.add_argument(
        "--plot", choices=["heatwave_days", "tmax_monthly_max_c", "tmax_monthly_mean_c"],
        nargs="*", default=None,
        help="Also write PNG heatmap(s) of the chosen column(s). "
             "Pass with no value to plot all three.",
    )
    p.add_argument("-v", "--verbose", action="count", default=0)
    args = p.parse_args(argv)

    if args.preset:
        preset = PRESETS[args.preset]
        args.district = preset.name
        args.bbox = list(preset.bbox)
    elif args.bbox is None:
        p.error("--bbox is required when --district is used without --preset")

    if args.plot == []:
        args.plot = ["heatwave_days", "tmax_monthly_max_c", "tmax_monthly_mean_c"]
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.WARNING - 10 * min(args.verbose, 2),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    df, meta = compute_heat_series(
        district=args.district,
        bbox=tuple(args.bbox),
        years=args.years,
        end_year=args.end_year,
        threshold_c=args.threshold_c,
        min_run=args.min_run,
        cache_dir=args.cache_dir,
        no_cache=args.no_cache,
        refresh=args.refresh,
        max_workers=args.max_workers,
    )

    table_path, json_path = output_paths(
        args.outdir, args.district,
        meta["window"]["start_year"], meta["window"]["end_year"],
        table_format=args.format,
    )
    sha = write_table(df, table_path, table_format=args.format)
    meta["output_data"] = {
        "path": str(table_path),
        "format": args.format,
        "sha256": sha,
    }
    meta["output_json"] = str(json_path)
    write_json(meta, json_path)

    print(f"wrote {table_path} ({len(df)} rows)")
    print(f"wrote {json_path}")

    if args.plot:
        from .viz import monthly_heatmap, save_figure
        for col in args.plot:
            fig = monthly_heatmap(df, value=col, title=f"{args.district} — {col}")
            png_path = table_path.with_name(f"{table_path.stem}__{col}.png")
            save_figure(fig, png_path)
            print(f"wrote {png_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
