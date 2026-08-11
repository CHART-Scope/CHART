#!/usr/bin/env Rscript
# Convert the two legacy Madhya Pradesh fitted-object files into one safe bundle.

suppressMessages(library(dlnm))

script_arg <- commandArgs(trailingOnly = FALSE)
script_path <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)])
script_dir <- dirname(normalizePath(script_path, mustWork = TRUE))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 6) {
  stop(
    paste(
      "Usage: package_mp_model.R STATE_RDS STATE_SHA256",
      "DIVISION_RDS DIVISION_SHA256 OUTPUT_RDS VERSION"
    ),
    call. = FALSE
  )
}

state_path <- normalizePath(args[[1]], mustWork = TRUE)
state_sha256 <- tolower(args[[2]])
division_path <- normalizePath(args[[3]], mustWork = TRUE)
division_sha256 <- tolower(args[[4]])
output_path <- args[[5]]
version <- args[[6]]
if (any(!grepl("^[0-9a-f]{64}$", c(state_sha256, division_sha256)))) {
  stop("Source SHA256 values must be 64 hex characters")
}
if (!nzchar(version)) stop("VERSION must not be empty")

state_bundle <- readRDS(state_path)
division_bundle <- readRDS(division_path)
divisions <- sort(unique(sub(
  "^cbTemp_(.+)_Sem[0-9]{2}$", "\\1",
  grep("^cbTemp_.+_Sem[0-9]{2}$", names(division_bundle), value = TRUE)
)))
if (length(divisions) != 10) {
  stop("Expected ten MP divisions, found ", length(divisions))
}

package_block <- function(source_bundle, area_key, area_name, window, ref_default = NULL) {
  sem <- sprintf("Sem%02d", window)
  suffix <- paste0(area_key, "_", sem)
  cb <- source_bundle[[paste0("cbTemp_", suffix)]]
  model <- source_bundle[[paste0("Model_", suffix)]]
  analysis <- source_bundle[[paste0("AnalysisData_", suffix)]]
  if (is.null(cb) || is.null(model) || is.null(analysis)) {
    stop("Source model block is incomplete: ", suffix)
  }
  if (!isTRUE(model$converged)) stop("Source GLM did not converge: ", suffix)

  temperature_terms <- grep("^Temp_Basis", names(coef(model)))
  outcome <- if (!is.null(model$model$lbw)) model$model$lbw else model$y
  if (is.null(outcome)) stop("Cannot determine fitted outcome rows: ", suffix)
  reference <- if (!is.null(ref_default) && is.finite(ref_default)) {
    as.numeric(ref_default)
  } else {
    as.numeric(quantile(analysis$mean_tmax_sem, 0.25, na.rm = TRUE))
  }

  list(
    basis = list(
      lag = unname(attr(cb, "lag")),
      argvar = attr(cb, "argvar"),
      arglag = attr(cb, "arglag")
    ),
    coefficients = unname(as.numeric(coef(model)[temperature_terms])),
    vcov = unname(as.matrix(vcov(model)[temperature_terms, temperature_terms])),
    reference_temperature_c = unname(reference),
    modelled_temperature_range_c = unname(as.numeric(attr(cb, "argvar")$Boundary.knots)),
    n_training = as.integer(nrow(analysis)),
    n_lbw_events = as.integer(sum(outcome == 1, na.rm = TRUE)),
    source_block = paste0(area_name, "_", sem)
  )
}

state_blocks <- setNames(lapply(1:3, function(window) {
  package_block(
    state_bundle,
    "MP",
    "Madhya Pradesh",
    window,
    state_bundle[[sprintf("ref_temp_default_MP_Sem%02d", window)]]
  )
}), as.character(1:3))
division_blocks <- setNames(lapply(divisions, function(area) {
  setNames(lapply(1:3, function(window) {
    package_block(division_bundle, area, area, window)
  }), as.character(1:3))
}), divisions)
areas <- c(list(`Madhya Pradesh` = state_blocks), division_blocks)
levels <- c(
  list(`Madhya Pradesh` = "state"),
  setNames(as.list(rep("division", length(divisions))), divisions)
)

bundle <- list(
  schema_version = 1L,
  model_family = "lbw_temperature_dlnm",
  country_code = "IN",
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
  areas = areas,
  geography_levels = levels,
  provenance = list(
    version = version,
    source_files = list(
      list(filename = basename(state_path), sha256 = state_sha256),
      list(filename = basename(division_path), sha256 = division_sha256)
    ),
    packaging_tool = "package_mp_model.R schema 1",
    contains_respondent_rows = FALSE
  )
)

source(file.path(script_dir, "compact_score.R"))
validate_compact_bundle(bundle)
dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
saveRDS(bundle, output_path, version = 3)
message("Packaged ", length(areas) * 3, " MP model blocks to ", output_path)
