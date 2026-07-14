#!/usr/bin/env Rscript
# HTTP inference API for Madhya Pradesh LBW temperature models.
#
# Supports:
#   - state-wide Madhya Pradesh
#   - 10 administrative divisions

suppressMessages({
  library(dlnm)
  library(plumber)
  library(jsonlite)
})

script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) == 1) return(normalizePath(dirname(file_arg), mustWork = FALSE))
  normalizePath(".", mustWork = FALSE)
}

source(file.path(script_dir(), "score.R"))

demo_root <- normalizePath(file.path(script_dir(), ".."), mustWork = FALSE)
model_dir <- Sys.getenv("LBW_MODEL_DIR", unset = file.path(demo_root, "model"))
division_path <- Sys.getenv(
  "LBW_MODEL_DIVISION",
  unset = file.path(model_dir, "MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds")
)
state_path <- Sys.getenv(
  "LBW_MODEL_STATE",
  unset = file.path(model_dir, "MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds")
)
port <- as.integer(Sys.getenv("PORT", "8000"))
host <- Sys.getenv("HOST", "127.0.0.1")

if (!file.exists(division_path)) stop("Division model file not found: ", division_path)
if (!file.exists(state_path)) stop("State model file not found: ", state_path)

division_store <- load_division_bundle(division_path)
state_store <- load_state_bundle(state_path)
state_area <- state_store$area

normalize_area <- function(area) {
  if (is.null(area) || !nzchar(area)) stop("area is required")
  if (identical(area, "MP") || identical(area, "Madhya Pradesh (state-wide)")) {
    return(state_area)
  }
  area
}

json <- plumber::serializer_unboxed_json()

pr <- plumber::pr() |>
  plumber::pr_set_serializer(json) |>
  plumber::pr_get("/health", function() {
    list(
      status = "ok",
      region = "MP",
      models = list(
        state = basename(state_path),
        division = basename(division_path)
      ),
      areas = length(division_store$divisions) + 1
    )
  }, serializer = json) |>
  plumber::pr_get("/areas", function() {
    list(
      region = "MP",
      state = list(
        area = state_area,
        geography_level = "state",
        reference_temp_c = state_store$metadata$reference_temp_c,
        trimesters = state_store$trimesters
      ),
      divisions = division_store$divisions
    )
  }, serializer = json) |>
  plumber::pr_get("/divisions", function() {
    list(
      region = "MP",
      state = state_area,
      divisions = division_store$divisions
    )
  }, serializer = json) |>
  plumber::pr_post("/predict", function(req, res) {
    tryCatch({
      body <- jsonlite::fromJSON(req$postBody, simplifyVector = TRUE)
      area <- normalize_area(body$area %||% body$division)
      score_area(
        division_store = division_store,
        state_store = state_store,
        area = area,
        trimester = body$trimester,
        tmax_lag = body$tmax_lag,
        ref = if (!is.null(body$ref)) body$ref else NULL
      )
    }, error = function(error) {
      res$status <- 400
      list(error = conditionMessage(error))
    })
  }, serializer = json) |>
  plumber::pr_static("/ui", file.path(demo_root, "web"))

`%||%` <- function(x, y) if (is.null(x)) y else x

message(sprintf(
  "[api] loaded state=%s (%d trimesters) division=%s (%d areas x 3 trimesters)",
  basename(state_path), length(state_store$trimesters),
  basename(division_path), length(division_store$divisions)
))
message(sprintf("[api] listening on http://%s:%d", host, port))
pr$run(host = host, port = port)
