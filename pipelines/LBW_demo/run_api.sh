#!/usr/bin/env bash
# Starts the plumber API on http://127.0.0.1:${PORT:-8000}
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export LBW_MODEL_DIVISION="${LBW_MODEL_DIVISION:-$HERE/model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds}"
export LBW_MODEL_STATE="${LBW_MODEL_STATE:-$HERE/model/MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds}"
export LBW_MODEL_RELEASE_MANIFEST="${LBW_MODEL_RELEASE_MANIFEST:-$HERE/model-release.example.json}"
export PORT="${PORT:-8000}"
PYTHON_BIN="${PYTHON:-python3}"
cd "$HERE"
exec "$PYTHON_BIN" model_release.py \
  --manifest "$LBW_MODEL_RELEASE_MANIFEST" \
  --division "$LBW_MODEL_DIVISION" \
  --state "$LBW_MODEL_STATE" \
  -- Rscript inference/api.R
