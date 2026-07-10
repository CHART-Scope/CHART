#!/usr/bin/env bash
set -euo pipefail

: "${LBW_MODEL_S3_URI:?Set LBW_MODEL_S3_URI to a private s3:// bucket/key URI.}"

model_dir="${LBW_MODEL_DIR:-/models}"
model_file="$(basename "${LBW_MODEL_S3_URI}")"
model_path="${model_dir}/${model_file}"

mkdir -p "$model_dir"

if [ ! -s "$model_path" ]; then
  echo "Downloading LBW model from S3..."
  aws s3 cp "$LBW_MODEL_S3_URI" "$model_path"
fi

export LBW_MODEL="$model_path"
exec Rscript inference/api.R
