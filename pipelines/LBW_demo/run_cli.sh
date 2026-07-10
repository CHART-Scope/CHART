#!/usr/bin/env bash
# Four direct-input smoke tests for the CLI predictor. Prints JSON per test case.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${LBW_MODEL:-$HERE/model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds}"

run() {
  echo "--- $1"
  shift
  Rscript "$HERE/inference/predict.R" --model "$MODEL" "$@"
  echo
}

run "Bhopal T3, temperate baseline (should give odds ratio=1)" \
    --division Bhopal  --trimester 1 --tmax "28,28,28" --ref 28
run "Gwalior T3, hot (paper's key finding)" \
    --division Gwalior --trimester 1 --tmax "38,37,35" --ref 28
run "Indore T3, hot" \
    --division Indore  --trimester 1 --tmax "38,37,35" --ref 28
run "Bhopal T1 (early pregnancy), hot" \
    --division Bhopal  --trimester 3 --tmax "38,37,35" --ref 28
