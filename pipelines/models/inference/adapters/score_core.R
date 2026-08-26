#!/usr/bin/env Rscript
# Shared numerical core for legacy and compact LBW DLNM model blocks.

score_dlnm_parameters <- function(
  basis,
  coefficients,
  covariance,
  tmax_lag,
  ref_temp,
  support,
  n_training,
  n_lbw_events = NULL
) {
  tmax_lag <- as.numeric(tmax_lag)
  ref_temp <- as.numeric(ref_temp)
  support <- as.numeric(support)
  coefficients <- as.numeric(coefficients)
  covariance <- as.matrix(covariance)

  expected_values <- as.integer(diff(as.numeric(basis$lag)) + 1L)
  if (length(expected_values) != 1 || !is.finite(expected_values) || expected_values < 1) {
    stop("model basis has an invalid lag definition")
  }
  if (length(tmax_lag) != expected_values || any(!is.finite(tmax_lag))) {
    stop(
      "temperature profile must contain exactly ", expected_values,
      " finite Celsius values"
    )
  }
  if (length(ref_temp) != 1 || !is.finite(ref_temp)) {
    stop("ref must be one finite Celsius value")
  }
  if (length(support) != 2 || any(!is.finite(support)) || support[1] >= support[2]) {
    stop("modelled temperature support must contain two increasing finite values")
  }
  if (!all(c("lag", "argvar", "arglag") %in% names(basis))) {
    stop("model basis is incomplete")
  }
  if (!length(coefficients) || any(!is.finite(coefficients))) {
    stop("model temperature coefficients are invalid")
  }
  if (!identical(dim(covariance), c(length(coefficients), length(coefficients))) ||
      any(!is.finite(covariance))) {
    stop("model temperature covariance is invalid")
  }

  on_support <- all(tmax_lag >= support[1] & tmax_lag <= support[2]) &&
    ref_temp >= support[1] && ref_temp <= support[2]
  cb_new <- suppressWarnings(dlnm::crossbasis(
    matrix(tmax_lag, 1),
    lag = basis$lag,
    argvar = basis$argvar,
    arglag = basis$arglag
  ))
  cb_ref <- dlnm::crossbasis(
    matrix(rep(ref_temp, expected_values), 1),
    lag = basis$lag,
    argvar = basis$argvar,
    arglag = basis$arglag
  )
  difference <- cb_new - cb_ref
  if (ncol(difference) != length(coefficients)) {
    stop("model basis and coefficient dimensions do not match")
  }

  log_or <- as.numeric(difference %*% coefficients)
  variance <- as.numeric(difference %*% covariance %*% t(difference))
  if (!is.finite(variance) || variance < -1e-12) {
    stop("model produced invalid prediction variance")
  }
  se_log_or <- sqrt(max(variance, 0))

  result <- list(
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
    n_training = as.integer(n_training)
  )
  if (!is.null(n_lbw_events)) result$n_lbw_events <- as.integer(n_lbw_events)
  result
}
