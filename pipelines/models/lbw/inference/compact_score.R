#!/usr/bin/env Rscript
# Scoring contract for sanitized CHART LBW DLNM bundles.

compact_source_path <- tryCatch(sys.frame(1)$ofile, error = function(...) NULL)
compact_script_arg <- commandArgs(trailingOnly = FALSE)
compact_script_path <- sub("^--file=", "", compact_script_arg[grep("^--file=", compact_script_arg)])
compact_script_dir <- if (length(compact_source_path) == 1 && nzchar(compact_source_path)) {
  dirname(normalizePath(compact_source_path, mustWork = TRUE))
} else if (length(compact_script_path) == 1) {
  dirname(normalizePath(compact_script_path, mustWork = TRUE))
} else {
  normalizePath(".", mustWork = TRUE)
}
if (!exists("score_dlnm_parameters")) {
  source(file.path(compact_script_dir, "score_core.R"))
}

validate_compact_bundle <- function(bundle) {
  required <- c(
    "schema_version", "model_family", "country_code", "outcome",
    "exposure", "areas", "provenance"
  )
  missing <- setdiff(required, names(bundle))
  if (length(missing)) {
    stop("Compact model bundle is missing: ", paste(missing, collapse = ", "))
  }
  if (!identical(as.integer(bundle$schema_version), 1L)) {
    stop("Unsupported compact model bundle schema_version")
  }
  if (!identical(bundle$model_family, "lbw_temperature_dlnm")) {
    stop("Unsupported compact model_family")
  }
  if (is.null(bundle$provenance$version) || !nzchar(bundle$provenance$version)) {
    stop("Compact model provenance.version is required")
  }
  if (!identical(bundle$provenance$contains_respondent_rows, FALSE)) {
    stop("Compact model must declare contains_respondent_rows = FALSE")
  }
  if (contains_forbidden_runtime_object(bundle)) {
    stop("Compact model contains a fitted model, crossbasis, or respondent table")
  }
  if (!is.list(bundle$areas) || !length(bundle$areas) || is.null(names(bundle$areas))) {
    stop("Compact model bundle must contain named areas")
  }
  if (!is.null(bundle$geography_levels)) {
    if (!identical(sort(names(bundle$geography_levels)), sort(names(bundle$areas))) ||
        any(!nzchar(unlist(bundle$geography_levels)))) {
      stop("Compact model geography_levels must name every area")
    }
  }

  for (area in names(bundle$areas)) {
    blocks <- bundle$areas[[area]]
    if (!identical(sort(names(blocks)), as.character(1:3))) {
      stop("Area ", area, " must contain pregnancy windows 1, 2, and 3")
    }
    for (window in names(blocks)) validate_compact_block(blocks[[window]], area, window)
  }
  invisible(bundle)
}

contains_forbidden_runtime_object <- function(value) {
  if (inherits(value, c("glm", "lm", "crossbasis", "data.frame"))) return(TRUE)
  if (!is.list(value)) return(FALSE)
  any(vapply(value, contains_forbidden_runtime_object, logical(1)))
}

validate_compact_block <- function(block, area = "", window = "") {
  required <- c(
    "basis", "coefficients", "vcov", "reference_temperature_c",
    "modelled_temperature_range_c", "n_training", "n_lbw_events"
  )
  missing <- setdiff(required, names(block))
  if (length(missing)) {
    stop(
      "Compact model block ", area, "/", window, " is missing: ",
      paste(missing, collapse = ", ")
    )
  }
  if (!all(c("lag", "argvar", "arglag") %in% names(block$basis))) {
    stop("Compact model block ", area, "/", window, " has an incomplete basis")
  }
  coefficients <- as.numeric(block$coefficients)
  covariance <- as.matrix(block$vcov)
  if (!length(coefficients) || any(!is.finite(coefficients))) {
    stop("Compact model block ", area, "/", window, " has invalid coefficients")
  }
  if (!identical(dim(covariance), c(length(coefficients), length(coefficients))) ||
      any(!is.finite(covariance))) {
    stop("Compact model block ", area, "/", window, " has invalid covariance")
  }
  support <- as.numeric(block$modelled_temperature_range_c)
  if (length(support) != 2 || any(!is.finite(support)) || support[1] >= support[2]) {
    stop("Compact model block ", area, "/", window, " has invalid support")
  }
  reference <- as.numeric(block$reference_temperature_c)
  n_training <- as.integer(block$n_training)
  n_events <- as.integer(block$n_lbw_events)
  if (length(reference) != 1 || !is.finite(reference)) {
    stop("Compact model block ", area, "/", window, " has invalid reference")
  }
  if (length(n_training) != 1 || is.na(n_training) || n_training < 1 ||
      length(n_events) != 1 || is.na(n_events) || n_events < 0 ||
      n_events > n_training) {
    stop("Compact model block ", area, "/", window, " has invalid counts")
  }
  invisible(block)
}

load_compact_bundle <- function(path) {
  bundle <- readRDS(path)
  validate_compact_bundle(bundle)
  list(path = path, bundle = bundle)
}

compact_area_block <- function(store, area, pregnancy_window) {
  if (is.null(area) || length(area) != 1 || !nzchar(trimws(area))) {
    stop("area is required")
  }
  normalized_area <- trimws(area)
  area_names <- names(store$bundle$areas)
  matched <- area_names[tolower(area_names) == tolower(normalized_area)]
  if (length(matched) != 1) {
    stop("area must be one of: ", paste(area_names, collapse = ", "))
  }
  if (length(pregnancy_window) != 1 || is.na(pregnancy_window) ||
      !(pregnancy_window %in% 1:3)) {
    stop("trimester must be 1 (last), 2 (middle), or 3 (earliest)")
  }
  list(
    area = matched,
    block = store$bundle$areas[[matched]][[as.character(pregnancy_window)]]
  )
}

score_compact_profile <- function(block, tmax_lag, ref = NULL) {
  tmax_lag <- as.numeric(tmax_lag)
  if (length(tmax_lag) != 3 || any(!is.finite(tmax_lag))) {
    stop("tmax_lag must contain exactly three finite Celsius values: lag 0, lag 1, lag 2")
  }
  if (!is.null(ref) && (length(ref) != 1 || !is.finite(ref))) {
    stop("ref must be one finite Celsius value when supplied")
  }

  ref_temp <- if (is.null(ref)) {
    as.numeric(block$reference_temperature_c)
  } else {
    as.numeric(ref)
  }
  score_dlnm_parameters(
    basis = block$basis,
    coefficients = block$coefficients,
    covariance = block$vcov,
    tmax_lag = tmax_lag,
    ref_temp = ref_temp,
    support = block$modelled_temperature_range_c,
    n_training = block$n_training,
    n_lbw_events = as.integer(block$n_lbw_events)
  )
}

score_compact_area <- function(store, area, trimester, tmax_lag, ref = NULL) {
  selected <- compact_area_block(store, area, trimester)
  result <- score_compact_profile(selected$block, tmax_lag, ref)
  geography_level <- if (is.null(store$bundle$geography_levels)) {
    "climate_zone"
  } else {
    unname(store$bundle$geography_levels[[selected$area]])
  }
  c(
    list(
      region = store$bundle$country_code,
      area = selected$area,
      geography_level = geography_level,
      trimester = as.integer(trimester),
      exposure_metric = store$bundle$exposure$description,
      exposure_unit = store$bundle$exposure$unit,
      model_file = basename(store$path)
    ),
    result
  )
}
