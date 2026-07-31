#!/usr/bin/env Rscript
# Shared scoring helpers for division- and state-level LBW temperature models.

score_temperature_profile <- function(cb, mod, analysis_data, tmax_lag, ref = NULL, ref_default = NULL) {
  tmax_lag <- as.numeric(tmax_lag)
  if (length(tmax_lag) != 3 || any(!is.finite(tmax_lag))) {
    stop("tmax_lag must contain exactly three finite Celsius values: lag 0, lag 1, lag 2")
  }
  if (!is.null(ref) && (length(ref) != 1 || !is.finite(ref))) {
    stop("ref must be one finite Celsius value when supplied")
  }

  ref_temp <- if (is.null(ref)) {
    if (!is.null(ref_default) && is.finite(ref_default)) {
      as.numeric(ref_default)
    } else if (!is.null(analysis_data$mean_tmax_sem)) {
      as.numeric(quantile(analysis_data$mean_tmax_sem, 0.25, na.rm = TRUE))
    } else {
      stop("ref is required when this model block has no default reference temperature")
    }
  } else {
    as.numeric(ref)
  }

  support <- as.numeric(attr(cb, "argvar")$Boundary.knots)
  on_support <- all(tmax_lag >= support[1] & tmax_lag <= support[2]) &&
    ref_temp >= support[1] && ref_temp <= support[2]

  cb_new <- suppressWarnings(crossbasis(
    matrix(tmax_lag, 1),
    lag = attr(cb, "lag"),
    argvar = attr(cb, "argvar"),
    arglag = attr(cb, "arglag")
  ))
  cb_ref <- crossbasis(
    matrix(rep(ref_temp, 3), 1),
    lag = attr(cb, "lag"),
    argvar = attr(cb, "argvar"),
    arglag = attr(cb, "arglag")
  )

  temperature_terms <- grep("^Temp_Basis", names(coef(mod)))
  difference <- cb_new - cb_ref
  log_or <- as.numeric(difference %*% coef(mod)[temperature_terms])
  se_log_or <- sqrt(as.numeric(
    difference %*% vcov(mod)[temperature_terms, temperature_terms] %*% t(difference)
  ))

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
      sprintf("training range (%.2f to %.2f C). This is an extrapolated association.", support[1], support[2])
    ),
    n_training = nrow(analysis_data)
  )
}

load_division_bundle <- function(path) {
  bundle <- readRDS(path)
  divisions <- sort(unique(sub(
    "^cbTemp_(.+)_Sem[0-9]{2}$", "\\1",
    grep("^cbTemp_", names(bundle), value = TRUE)
  )))
  list(
    path = path,
    bundle = bundle,
    divisions = divisions,
    geography_level = "division"
  )
}

load_state_bundle <- function(path) {
  bundle <- readRDS(path)
  trimesters <- sort(as.integer(sub(
    "^cbTemp_MP_Sem([0-9]{2})$", "\\1",
    grep("^cbTemp_MP_Sem", names(bundle), value = TRUE)
  )))
  list(
    path = path,
    bundle = bundle,
    trimesters = trimesters,
    geography_level = "state",
    area = "Madhya Pradesh",
    metadata = bundle$metadata
  )
}

division_block <- function(store, division, trimester) {
  if (!division %in% store$divisions) {
    stop("division must be one of: ", paste(store$divisions, collapse = ", "))
  }
  if (length(trimester) != 1 || is.na(trimester) || !(trimester %in% 1:3)) {
    stop("trimester must be 1 (last), 2 (middle), or 3 (earliest)")
  }

  sem <- sprintf("Sem%02d", trimester)
  cb <- store$bundle[[sprintf("cbTemp_%s_%s", division, sem)]]
  mod <- store$bundle[[sprintf("Model_%s_%s", division, sem)]]
  ad <- store$bundle[[sprintf("AnalysisData_%s_%s", division, sem)]]
  if (is.null(cb) || is.null(mod) || is.null(ad)) stop("Model block is incomplete")
  list(cb = cb, mod = mod, ad = ad, ref_default = NULL)
}

state_block <- function(store, trimester) {
  if (length(trimester) != 1 || is.na(trimester) || !(trimester %in% store$trimesters)) {
    stop("trimester must be one of: ", paste(store$trimesters, collapse = ", "))
  }

  sem <- sprintf("Sem%02d", trimester)
  cb <- store$bundle[[sprintf("cbTemp_MP_%s", sem)]]
  mod <- store$bundle[[sprintf("Model_MP_%s", sem)]]
  ad <- store$bundle[[sprintf("AnalysisData_MP_%s", sem)]]
  ref_default <- store$bundle[[sprintf("ref_temp_default_MP_%s", sem)]]
  if (is.null(cb) || is.null(mod) || is.null(ad)) stop("State model block is incomplete")
  list(cb = cb, mod = mod, ad = ad, ref_default = ref_default)
}

score_area <- function(
  division_store,
  state_store,
  area,
  trimester,
  tmax_lag,
  ref = NULL,
  model_version,
  division_sha256,
  state_sha256
) {
  if (identical(area, "Madhya Pradesh")) {
    block <- state_block(state_store, trimester)
    geography_level <- "state"
  } else {
    block <- division_block(division_store, area, trimester)
    geography_level <- "division"
  }

  result <- score_temperature_profile(
    cb = block$cb,
    mod = block$mod,
    analysis_data = block$ad,
    tmax_lag = tmax_lag,
    ref = ref,
    ref_default = block$ref_default
  )

  c(
    list(
      region = "MP",
      area = area,
      geography_level = geography_level,
      trimester = as.integer(trimester),
      exposure_metric = "monthly mean of daily maximum 2m temperature (Celsius)",
      model_file = basename(if (geography_level == "state") state_store$path else division_store$path),
      model_version = model_version,
      model_sha256 = if (geography_level == "state") state_sha256 else division_sha256
    ),
    result
  )
}
