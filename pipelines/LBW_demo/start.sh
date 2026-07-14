#!/usr/bin/env bash
set -euo pipefail

: "${LBW_MODEL_DIVISION_S3_URI:?Set LBW_MODEL_DIVISION_S3_URI to the division model s3:// bucket/key URI.}"
: "${LBW_MODEL_STATE_S3_URI:?Set LBW_MODEL_STATE_S3_URI to the state model s3:// bucket/key URI.}"

model_dir="${LBW_MODEL_DIR:-/models}"
division_file="$(basename "${LBW_MODEL_DIVISION_S3_URI}")"
state_file="$(basename "${LBW_MODEL_STATE_S3_URI}")"
division_path="${model_dir}/${division_file}"
state_path="${model_dir}/${state_file}"

mkdir -p "$model_dir"

if [ ! -s "$division_path" ]; then
  echo "Downloading division LBW model from S3..."
  aws s3 cp "$LBW_MODEL_DIVISION_S3_URI" "$division_path"
fi

if [ ! -s "$state_path" ]; then
  echo "Downloading state LBW model from S3..."
  aws s3 cp "$LBW_MODEL_STATE_S3_URI" "$state_path"
fi

export LBW_MODEL_DIVISION="$division_path"
export LBW_MODEL_STATE="$state_path"

exec Rscript inference/api.R
