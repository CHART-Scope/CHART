#!/usr/bin/env bash
# Starts the plumber API on http://127.0.0.1:${PORT:-8000}
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export LBW_MODEL="${LBW_MODEL:-$HERE/model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds}"
export PORT="${PORT:-8000}"
cd "$HERE"
exec Rscript inference/api.R
