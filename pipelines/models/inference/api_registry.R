#!/usr/bin/env Rscript
# Release-aware compact-model runtime. It starts empty and loads verified server-side
# artifacts through an internal control endpoint; model selection is never read
# from release-specific environment variables.

suppressMessages({
  library(dlnm)
  library(plumber)
  library(jsonlite)
})

script_arg <- commandArgs(trailingOnly = FALSE)
script_path <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)])
script_dir <- dirname(normalizePath(script_path, mustWork = TRUE))
source(file.path(script_dir, "serialization.R"))
# Adapters live in inference/adapters/. Sourcing compact_score.R also
# pulls in score_core.R via its own source() at the top. Register a new
# adapter here (or introduce on-demand loading if the surface grows).
source(file.path(script_dir, "adapters", "compact_score.R"))

port <- as.integer(Sys.getenv("PORT", "8000"))
host <- Sys.getenv("HOST", "127.0.0.1")
cache_dir <- normalizePath(
  Sys.getenv("MODEL_CACHE_DIR", unset = file.path(script_dir, "..")),
  mustWork = TRUE
)
control_token <- Sys.getenv("MODEL_CONTROL_TOKEN")
if (!nzchar(control_token)) stop("MODEL_CONTROL_TOKEN is required")

loaded_models <- new.env(parent = emptyenv())
json <- api_json_serializer()
`%||%` <- function(x, y) if (is.null(x)) y else x

required_text <- function(value, field) {
  if (is.null(value) || length(value) != 1 || !is.character(value) || !nzchar(trimws(value))) {
    stop(field, " is required")
  }
  trimws(value)
}

model_key <- function(release_id, model_file, sha256) {
  paste(release_id, model_file, tolower(sha256), sep = "::")
}

file_sha256 <- function(path) {
  sha256sum <- Sys.which("sha256sum")
  if (nzchar(sha256sum)) {
    output <- system2(sha256sum, path, stdout = TRUE, stderr = TRUE)
  } else {
    shasum <- Sys.which("shasum")
    if (!nzchar(shasum)) stop("No SHA-256 command is available")
    output <- system2(shasum, c("-a", "256", path), stdout = TRUE, stderr = TRUE)
  }
  digest <- strsplit(output[[1]], "[[:space:]]+")[[1]][[1]]
  digest <- tolower(digest)
  if (!grepl("^[0-9a-f]{64}$", digest)) stop("Could not calculate artifact SHA-256")
  digest
}

require_control_token <- function(req) {
  supplied <- req$HTTP_X_CHART_MODEL_CONTROL_TOKEN %||% ""
  if (!identical(supplied, control_token)) stop("MODEL_CONTROL_UNAUTHORIZED")
}

load_model <- function(body) {
  release_id <- required_text(body$release_id, "release_id")
  version <- required_text(body$model_version, "model_version")
  model_file <- required_text(body$model_file, "model_file")
  expected_sha256 <- tolower(required_text(body$model_sha256, "model_sha256"))
  local_path <- normalizePath(required_text(body$local_path, "local_path"), mustWork = TRUE)
  if (!grepl("^[0-9a-f]{64}$", expected_sha256)) stop("model_sha256 is invalid")
  if (!identical(basename(local_path), model_file)) stop("MODEL_FILE_PATH_MISMATCH")
  if (!startsWith(local_path, paste0(cache_dir, .Platform$file.sep))) {
    stop("MODEL_PATH_OUTSIDE_CACHE")
  }
  actual_sha256 <- file_sha256(local_path)
  if (!identical(actual_sha256, expected_sha256)) stop("MODEL_CHECKSUM_MISMATCH")

  store <- load_compact_bundle(local_path)
  if (!identical(store$bundle$provenance$version, version)) {
    stop("MODEL_VERSION_MISMATCH")
  }
  key <- model_key(release_id, model_file, actual_sha256)
  loaded_models[[key]] <- list(
    release_id = release_id,
    version = version,
    model_file = model_file,
    model_sha256 = actual_sha256,
    loaded_at = format(Sys.time(), tz = "UTC", usetz = TRUE),
    store = store
  )
  loaded_models[[key]]
}

public_model <- function(model) {
  list(
    release_id = model$release_id,
    model_version = model$version,
    model_file = model$model_file,
    model_sha256 = model$model_sha256,
    country_code = model$store$bundle$country_code,
    outcome = model$store$bundle$outcome,
    model_family = model$store$bundle$model_family,
    areas = names(model$store$bundle$areas),
    loaded_at = model$loaded_at
  )
}

pr <- plumber::pr() |>
  plumber::pr_set_serializer(json) |>
  plumber::pr_get("/health", function() {
    list(
      status = "ok",
      runtime = "registry",
      model_cache_dir = cache_dir,
      loaded_models = length(ls(loaded_models))
    )
  }, serializer = json) |>
  plumber::pr_get("/models", function() {
    list(models = lapply(mget(ls(loaded_models), loaded_models), public_model))
  }, serializer = json) |>
  plumber::pr_post("/models/load", function(req, res) {
    tryCatch({
      require_control_token(req)
      body <- jsonlite::fromJSON(req$postBody, simplifyVector = TRUE)
      public_model(load_model(body))
    }, error = function(error) {
      res$status <- if (identical(conditionMessage(error), "MODEL_CONTROL_UNAUTHORIZED")) 403 else 400
      list(error = conditionMessage(error))
    })
  }, serializer = json) |>
  plumber::pr_post("/predict", function(req, res) {
    tryCatch({
      body <- jsonlite::fromJSON(req$postBody, simplifyVector = TRUE)
      release_id <- required_text(body$release_id, "release_id")
      model_file <- required_text(body$model_file, "model_file")
      model_sha256 <- tolower(required_text(body$model_sha256, "model_sha256"))
      key <- model_key(release_id, model_file, model_sha256)
      model <- loaded_models[[key]]
      if (is.null(model)) stop("MODEL_RELEASE_NOT_LOADED")
      requested_version <- required_text(body$model_version, "model_version")
      if (!identical(requested_version, model$version)) stop("MODEL_VERSION_MISMATCH")

      if (identical(model$store$bundle$model_family, "lbw_temperature_dlnm")) {
        result <- score_compact_area(
          store = model$store,
          area = body$area,
          trimester = body$trimester,
          tmax_lag = body$tmax_lag,
          ref = body$ref %||% NULL
        )
      } else {
        requested_outcome <- required_text(body$outcome, "outcome")
        if (!identical(requested_outcome, model$store$bundle$outcome)) {
          stop("MODEL_OUTCOME_MISMATCH")
        }
        exposure_values <- body$exposure_values_c %||% body$tmax_lag
        result <- score_compact_association(
          store = model$store,
          area = body$area,
          exposure_values_c = exposure_values,
          ref = body$ref %||% NULL
        )
      }
      c(
        list(model_release_id = model$release_id),
        result,
        list(model_version = model$version, model_sha256 = model$model_sha256)
      )
    }, error = function(error) {
      res$status <- 400
      list(error = conditionMessage(error))
    })
  }, serializer = json)

message(sprintf("[api] registry runtime ready with empty cache at %s", cache_dir))
message(sprintf("[api] listening on http://%s:%d", host, port))
pr$run(host = host, port = port)
