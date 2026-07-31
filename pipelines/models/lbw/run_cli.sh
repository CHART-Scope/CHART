#!/usr/bin/env bash
# Smoke tests for state-wide and division-level CLI inference.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIVISION_MODEL="${LBW_MODEL_DIVISION:-$HERE/model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds}"
STATE_MODEL="${LBW_MODEL_STATE:-$HERE/model/MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds}"
COMMON=(--division-model "$DIVISION_MODEL" --state-model "$STATE_MODEL")

run() {
  echo "--- $1"
  shift
  Rscript "$HERE/inference/predict.R" "${COMMON[@]}" "$@"
  echo
}

run "Madhya Pradesh (state), T3 hot profile" \
    --area "Madhya Pradesh" --trimester 1 --tmax "38,37,35"
run "Gwalior (division), T3 hot profile" \
    --area Gwalior --trimester 1 --tmax "38,37,35"
run "Bhopal (division), T3 temperate baseline at ref" \
    --area Bhopal --trimester 1 --tmax "28,28,28" --ref 28
run "Madhya Pradesh (state), T1 early pregnancy hot profile" \
    --area "Madhya Pradesh" --trimester 3 --tmax "38,37,35"
