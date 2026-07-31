#!/usr/bin/env python3
"""
Tiny Python client for the LBW inference API.

Usage:
    python3 query.py --list
    python3 query.py --area "Madhya Pradesh" --trimester 1 --tmax 38 37 35
    python3 query.py --area Gwalior --trimester 1 --tmax 37.2 36.8 35.4
    python3 query.py --area Bhopal --trimester 1 --tmax 28 28 28 --ref 28

No third-party deps — stdlib only.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "http://127.0.0.1:8000"


def get(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


def post(url, body):
    data = json.dumps(body).encode()
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return json.loads(error.read().decode())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--list", action="store_true", help="show available areas")
    parser.add_argument("--area", help="Madhya Pradesh or a division name")
    parser.add_argument("--division", help="deprecated alias for --area")
    parser.add_argument("--trimester", type=int, choices=[1, 2, 3])
    parser.add_argument(
        "--tmax",
        nargs=3,
        type=float,
        metavar=("LAG0", "LAG1", "LAG2"),
        help="monthly max-temp (Celsius), most recent first",
    )
    parser.add_argument(
        "--ref",
        type=float,
        default=None,
        help="reference temperature (default depends on model level)",
    )
    args = parser.parse_args()

    if args.list:
        print(json.dumps(get(f"{args.url}/areas"), indent=2))
        return

    area = args.area or args.division
    if not (area and args.trimester and args.tmax):
        parser.error("need --area, --trimester, --tmax (or --list)")

    body = {"area": area, "trimester": args.trimester, "tmax_lag": args.tmax}
    if args.ref is not None:
        body["ref"] = args.ref

    output = post(f"{args.url}/predict", body)

    if "odds_ratio" in output:
        level = output.get("geography_level", "division")
        print(f"\n{output['area']} ({level}), trimester {output['trimester']}:")
        print(f"  tmax_lag = {output['tmax_lag']}   ref = {output['ref_temp']} °C")
        print(
            f"  odds ratio = {output['odds_ratio']}  "
            f"(95% CI {output['ci95_low']} – {output['ci95_high']})"
        )
        print(
            f"  trained on n = {output['n_training']}   "
            f"model = {output['model_file']}\n"
        )
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
