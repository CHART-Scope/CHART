#!/usr/bin/env Rscript
# Scoring contract for sanitized CHART LBW DLNM bundles.

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
  if (!is.list(bundle$areas) || !length(bundle$areas) || is.null(names(bundle$areas))) {
    stop("Compact model bundle must contain named areas")
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
  support <- as.numeric(block$modelled_temperature_range_c)
  on_support <- all(tmax_lag >= support[1] & tmax_lag <= support[2]) &&
    ref_temp >= support[1] && ref_temp <= support[2]

  cb_new <- suppressWarnings(dlnm::crossbasis(
    matrix(tmax_lag, 1),
    lag = block$basis$lag,
    argvar = block$basis$argvar,
    arglag = block$basis$arglag
  ))
  cb_ref <- dlnm::crossbasis(
    matrix(rep(ref_temp, 3), 1),
    lag = block$basis$lag,
    argvar = block$basis$argvar,
    arglag = block$basis$arglag
  )
  difference <- cb_new - cb_ref
  coefficients <- as.numeric(block$coefficients)
  covariance <- as.matrix(block$vcov)
  if (ncol(difference) != length(coefficients)) {
    stop("Compact model basis and coefficient dimensions do not match")
  }

  log_or <- as.numeric(difference %*% coefficients)
  variance <- as.numeric(difference %*% covariance %*% t(difference))
  if (!is.finite(variance) || variance < -1e-12) {
    stop("Compact model produced invalid prediction variance")
  }
  se_log_or <- sqrt(max(variance, 0))

  list(
    ref_temp = round(ref_temp, 2),
    tmax_lag = unname(tmax_lag),
    metric = "odds_ratio",
    odds_ratio = round(exp(log_or), 4),
    ci95_low = round(exp(log_or - 1.96 * se_log_or), 4),
    ci95_high = round(exp(log_or + 1.96 * se_log_or), 4),
    modelled_temperature_range_c = unname(round(support, 2)),
    on_training_support = on_support,
    warning = if (on_support) "" else paste0(
      "At least one input or the reference temperature is outside this model block's ",
      sprintf(
        "training range (%.2f to %.2f C). This is an extrapolated association.",
        support[1], support[2]
      )
    ),
    n_training = as.integer(block$n_training),
    n_lbw_events = as.integer(block$n_lbw_events)
  )
}

score_compact_area <- function(store, area, trimester, tmax_lag, ref = NULL) {
  selected <- compact_area_block(store, area, trimester)
  result <- score_compact_profile(selected$block, tmax_lag, ref)
  c(
    list(
      region = store$bundle$country_code,
      area = selected$area,
      geography_level = "climate_zone",
      trimester = as.integer(trimester),
      exposure_metric = store$bundle$exposure$description,
      exposure_unit = store$bundle$exposure$unit,
      model_file = basename(store$path)
    ),
    result
  )
}
