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
  # One profile or many. A day-grain model is asked about a whole month, which
  # is one trailing profile per day, and dlnm scores a matrix of them in a
  # single crossbasis - the same shape the model was fitted on. A plain vector
  # is one profile, and the arithmetic below reduces to exactly what it was.
  profiles <- if (is.matrix(tmax_lag)) {
    matrix(as.numeric(tmax_lag), nrow = nrow(tmax_lag))
  } else {
    matrix(as.numeric(tmax_lag), nrow = 1)
  }
  ref_temp <- as.numeric(ref_temp)
  support <- as.numeric(support)
  coefficients <- as.numeric(coefficients)
  covariance <- as.matrix(covariance)

  expected_values <- as.integer(diff(as.numeric(basis$lag)) + 1L)
  if (length(expected_values) != 1 || !is.finite(expected_values) || expected_values < 1) {
    stop("model basis has an invalid lag definition")
  }
  if (ncol(profiles) != expected_values || !nrow(profiles) ||
      any(!is.finite(profiles))) {
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

  on_support <- all(profiles >= support[1] & profiles <= support[2]) &&
    ref_temp >= support[1] && ref_temp <= support[2]
  cb_new <- suppressWarnings(dlnm::crossbasis(
    profiles,
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
  difference <- sweep(cb_new, 2, cb_ref[1, ], "-")
  if (ncol(difference) != length(coefficients)) {
    stop("model basis and coefficient dimensions do not match")
  }

  # Per-profile odds ratios, then the month's figure as their mean. The mean of
  # the odds ratios, not the odds ratio of the mean exposure: the curve is not
  # linear, so those differ, and it is the per-day mean that corresponds to the
  # expected count over the month.
  per_profile <- exp(as.numeric(difference %*% coefficients))
  odds_ratio_mean <- mean(per_profile)

  # Delta method on that mean, which shares one coefficient vector across every
  # profile and so cannot be averaged from per-profile intervals. The gradient
  # with respect to the coefficients is mean(OR_i * d_i). At one profile this
  # collapses to OR * se(log OR) and the interval below is identical, to
  # floating point, to the one this function has always returned.
  gradient <- as.numeric(colMeans(per_profile * difference))
  variance <- as.numeric(t(gradient) %*% covariance %*% gradient)
  if (!is.finite(variance) || variance < -1e-12) {
    stop("model produced invalid prediction variance")
  }
  se_mean <- sqrt(max(variance, 0))
  # Carried on the log scale so the bound stays positive.
  se_log_or <- se_mean / odds_ratio_mean
  log_or <- log(odds_ratio_mean)

  result <- list(
    ref_temp = round(ref_temp, 2),
    tmax_lag = if (nrow(profiles) == 1) unname(profiles[1, ]) else unname(profiles),
    profiles_scored = nrow(profiles),
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
