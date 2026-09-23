#!/usr/bin/env Rscript
# A day-grain model is asked about a whole month: one trailing profile per day,
# scored together and averaged. These are the properties that makes legitimate.

suppressMessages(library(dlnm))
script_arg <- commandArgs(trailingOnly = FALSE)
script_dir <- dirname(normalizePath(
  sub("^--file=", "", script_arg[grep("^--file=", script_arg)]),
  mustWork = TRUE
))
source(file.path(script_dir, "..", "adapters", "score_core.R"))

# A small, explicit DLNM block rather than a shipped artifact, so the test says
# what it depends on and does not drift when a release is replaced.
set.seed(1)
lag_range <- c(0, 3)
training <- matrix(runif(400, 20, 40), ncol = 4)
basis_fit <- crossbasis(
  training,
  lag = lag_range,
  argvar = list(fun = "bs", degree = 2, knots = quantile(training, c(0.35, 0.93))),
  arglag = list(fun = "strata", breaks = 3)
)
k <- ncol(basis_fit)
basis <- list(
  lag = lag_range,
  argvar = attr(basis_fit, "argvar"),
  arglag = attr(basis_fit, "arglag")
)
coefficients <- rnorm(k, 0, 0.05)
covariance <- diag(k) * 0.01
support <- c(20, 40)
score <- function(profiles) {
  score_dlnm_parameters(
    basis, coefficients, covariance, profiles,
    ref_temp = 30, support = support, n_training = 100L
  )
}

profiles <- rbind(c(34, 33, 32, 31), c(38, 37, 36, 35), c(24, 25, 26, 27))

# 1. Scoring many profiles at once is scoring each of them.
singles <- apply(profiles, 1, function(row) score(row)$odds_ratio)
batched <- score(profiles)
stopifnot(batched$profiles_scored == 3L)
stopifnot(abs(batched$odds_ratio - mean(singles)) < 1e-4)

# 2. The month is the mean, never the worst day in it. This is the regression
#    guard for `peak_consecutive_window`, which reported the hottest run alone.
stopifnot(batched$odds_ratio < max(singles))
stopifnot(batched$odds_ratio > min(singles))

# 3. One profile is byte-for-byte what it was before batching existed: the
#    delta method on the mean collapses to exp(eta +- 1.96 * se) at n = 1.
one <- score(c(38, 37, 36, 35))
stopifnot(one$profiles_scored == 1L)
stopifnot(identical(one$tmax_lag, c(38, 37, 36, 35)))
difference <- {
  cb_new <- suppressWarnings(crossbasis(matrix(c(38, 37, 36, 35), 1),
    lag = basis$lag, argvar = basis$argvar, arglag = basis$arglag))
  cb_ref <- crossbasis(matrix(rep(30, 4), 1),
    lag = basis$lag, argvar = basis$argvar, arglag = basis$arglag)
  cb_new - cb_ref
}
eta <- as.numeric(difference %*% coefficients)
se <- sqrt(as.numeric(difference %*% covariance %*% t(difference)))
stopifnot(abs(one$odds_ratio - round(exp(eta), 4)) < 1e-9)
stopifnot(abs(one$ci95_low - round(exp(eta - 1.96 * se), 4)) < 1e-9)
stopifnot(abs(one$ci95_high - round(exp(eta + 1.96 * se), 4)) < 1e-9)

# 4. The interval widens with uncertainty rather than being copied from a day.
stopifnot(batched$ci95_low < batched$odds_ratio)
stopifnot(batched$ci95_high > batched$odds_ratio)

# 5. One day outside the training range puts the whole month outside it.
off <- score(rbind(c(34, 33, 32, 31), c(44, 43, 42, 41)))
stopifnot(!off$on_training_support)
stopifnot(nzchar(off$warning))
stopifnot(score(profiles)$on_training_support)

# 6. A ragged profile is refused rather than recycled into the wrong shape.
wrong <- tryCatch({ score(rbind(c(34, 33, 32), c(31, 30, 29))); "" }, error = conditionMessage)
stopifnot(grepl("exactly 4", wrong, fixed = TRUE))

message("Day-grain batch scoring averages profiles and preserves single-profile results.")
