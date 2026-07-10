#!/usr/bin/env python3
"""
Tiny Python client for the LBW inference API.

Usage:
    python3 query.py --division Gwalior --trimester 1 --tmax 37.2 36.8 35.4
    python3 query.py --division Bhopal  --trimester 1 --tmax 28   28   28   --ref 28
    python3 query.py --list

No 3rd-party deps — pure stdlib (urllib + argparse + json).
"""
import argparse, json, sys, urllib.request, urllib.error

DEFAULT_URL = "http://127.0.0.1:8000"


def get(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.load(r)


def post(url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default=DEFAULT_URL)
    p.add_argument("--list", action="store_true", help="show available divisions")
    p.add_argument("--division")
    p.add_argument("--trimester", type=int, choices=[1, 2, 3])
    p.add_argument("--tmax", nargs=3, type=float, metavar=("LAG0", "LAG1", "LAG2"),
                   help="monthly max-temp (Celsius), most recent first")
    p.add_argument("--ref", type=float, default=None,
                   help="reference temperature (default: training p25)")
    args = p.parse_args()

    if args.list:
        print(json.dumps(get(f"{args.url}/divisions"), indent=2))
        return

    if not (args.division and args.trimester and args.tmax):
        p.error("need --division, --trimester, --tmax (or --list)")

    body = {"division": args.division, "trimester": args.trimester,
            "tmax_lag": args.tmax}
    if args.ref is not None:
        body["ref"] = args.ref
    out = post(f"{args.url}/predict", body)

    # Human line + full JSON
    if "odds_ratio" in out:
        print(f"\n{out['division']}, trimester {out['trimester']}:")
        print(f"  tmax_lag = {out['tmax_lag']}   ref = {out['ref_temp']} °C")
        print(f"  odds ratio = {out['odds_ratio']}  (95% CI {out['ci95_low']} – {out['ci95_high']})")
        print(f"  trained on n = {out['n_training']}   model = {out['model_file']}\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
