#!/usr/bin/env bash
# Installs the R packages the demo needs. Idempotent.
set -euo pipefail
Rscript -e '
pkgs <- c("dlnm", "plumber", "jsonlite", "optparse")
new  <- setdiff(pkgs, rownames(installed.packages()))
if (length(new)) install.packages(new, repos = "https://cloud.r-project.org", Ncpus = 4)
cat("[setup] R packages OK: ", paste(pkgs, collapse=" "), "\n")
'
echo "[setup] Python client uses stdlib only — nothing to install."
