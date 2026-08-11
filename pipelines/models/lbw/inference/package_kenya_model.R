#!/usr/bin/env Rscript
# Package the recovered Kenya fitted objects into a deployment-safe bundle.

suppressMessages(library(dlnm))

script_arg <- commandArgs(trailingOnly = FALSE)
script_path <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)])
script_dir <- dirname(normalizePath(script_path, mustWork = TRUE))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 4) {
  stop(
    "Usage: package_kenya_model.R SOURCE_RDS OUTPUT_RDS SOURCE_SHA256 VERSION",
    call. = FALSE
  )
}

source_path <- normalizePath(args[[1]], mustWork = TRUE)
output_path <- args[[2]]
source_sha256 <- tolower(args[[3]])
version <- args[[4]]
if (!grepl("^[0-9a-f]{64}$", source_sha256)) stop("SOURCE_SHA256 must be 64 hex characters")
if (!nzchar(version)) stop("VERSION must not be empty")

source_bundle <- readRDS(source_path)
cb_names <- grep("^cbTemp_.+_Sem[0-9]{2}$", names(source_bundle), value = TRUE)
areas <- sort(unique(sub("_Sem[0-9]{2}$", "", sub("^cbTemp_", "", cb_names))))
if (length(areas) != 5) {
  stop("Expected five fitted Kenya climate zones, found ", length(areas))
}

package_block <- function(area, window) {
  sem <- sprintf("Sem%02d", window)
  suffix <- paste0(area, "_", sem)
  cb <- source_bundle[[paste0("cbTemp_", suffix)]]
  model <- source_bundle[[paste0("Model_", suffix)]]
  analysis <- source_bundle[[paste0("AnalysisData_", suffix)]]
  if (is.null(cb) || is.null(model) || is.null(analysis)) {
    stop("Source model block is incomplete: ", suffix)
  }
  if (!isTRUE(model$converged)) stop("Source GLM did not converge: ", suffix)

  temperature_terms <- grep("^Temp_Basis", names(coef(model)))
  coefficients <- unname(as.numeric(coef(model)[temperature_terms]))
  covariance <- unname(as.matrix(vcov(model)[temperature_terms, temperature_terms]))
  model_rows <- model$model
  outcome <- if (!is.null(model_rows$lbw)) model_rows$lbw else model$y
  if (is.null(outcome)) stop("Cannot determine fitted outcome rows: ", suffix)

  list(
    basis = list(
      lag = unname(attr(cb, "lag")),
      argvar = attr(cb, "argvar"),
      arglag = attr(cb, "arglag")
    ),
    coefficients = coefficients,
    vcov = covariance,
    reference_temperature_c = unname(as.numeric(
      quantile(analysis$mean_tmax_sem, 0.25, na.rm = TRUE)
    )),
    modelled_temperature_range_c = unname(as.numeric(
      attr(cb, "argvar")$Boundary.knots
    )),
    n_training = as.integer(nobs(model)),
    n_lbw_events = as.integer(sum(outcome == 1, na.rm = TRUE)),
    source_block = suffix
  )
}

area_blocks <- setNames(lapply(areas, function(area) {
  setNames(lapply(1:3, function(window) package_block(area, window)), as.character(1:3))
}), trimws(areas))

bundle <- list(
  schema_version = 1L,
  model_family = "lbw_temperature_dlnm",
  country_code = "KE",
  outcome = "lbw",
  exposure = list(
    variable = "tasmax",
    description = "monthly mean of daily maximum 2m air temperature",
    unit = "Celsius",
    order = c("lag0_newest", "lag1_previous", "lag2_oldest")
  ),
  pregnancy_windows = list(
    `1` = "latest/final pregnancy window (source Sem01)",
    `2` = "middle pregnancy window (source Sem02)",
    `3` = "earliest/first pregnancy window (source Sem03)"
  ),
  areas = area_blocks,
  geography_levels = setNames(as.list(rep("climate_zone", length(areas))), areas),
  provenance = list(
    version = version,
    source_filename = basename(source_path),
    source_sha256 = source_sha256,
    packaging_tool = "package_kenya_model.R schema 1",
    contains_respondent_rows = FALSE
  )
)

source(file.path(script_dir, "compact_score.R"))
validate_compact_bundle(bundle)
dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
saveRDS(bundle, output_path, version = 3)
message("Packaged ", length(areas) * 3, " model blocks to ", output_path)
