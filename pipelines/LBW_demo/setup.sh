#!/usr/bin/env bash
# Installs the R packages the demo needs. Idempotent.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
Rscript -e '
pkgs <- c("dlnm", "plumber", "jsonlite", "optparse", "splines")
new  <- setdiff(pkgs, rownames(installed.packages()))
if (length(new)) install.packages(setdiff(new, "splines"), repos = "https://cloud.r-project.org", Ncpus = 4)
cat("[setup] R packages OK: ", paste(pkgs, collapse=" "), "\n")
'
echo "[setup] Python client uses stdlib only — nothing to install."

DIVISION_MODEL="$HERE/model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds"
STATE_MODEL="$HERE/model/MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds"
STATE_SOURCE="$HERE/model/Dlnlm_Objs_source.rds"

if [ ! -s "$DIVISION_MODEL" ]; then
  echo "[setup] Missing division model: $DIVISION_MODEL"
  echo "[setup] Copy MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds into model/ before running the API."
  exit 1
fi

if [ ! -s "$STATE_MODEL" ]; then
  if [ -s "$STATE_SOURCE" ]; then
    echo "[setup] Building state model bundle from Dlnlm_Objs_source.rds..."
    Rscript "$HERE/inference/package_state_model.R"
  else
    echo "[setup] Missing state model: $STATE_MODEL"
    echo "[setup] Copy Dlnlm_Objs.rds to model/Dlnlm_Objs_source.rds, then rerun setup.sh"
    exit 1
  fi
fi

echo "[setup] Model bundles ready."
