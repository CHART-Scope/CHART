#!/usr/bin/env Rscript

suppressMessages(library(dlnm))

script_arg <- commandArgs(trailingOnly = FALSE)
script_path <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)])
test_dir <- dirname(normalizePath(script_path, mustWork = TRUE))
source(file.path(test_dir, "..", "inference", "compact_score.R"))

argvar <- list(
  fun = "bs",
  knots = 30,
  degree = 2,
  intercept = FALSE,
  Boundary.knots = c(20, 40)
)
arglag <- list(
  fun = "ns",
  knots = 1,
  intercept = TRUE,
  Boundary.knots = c(0, 2)
)
basis <- crossbasis(matrix(c(25, 25, 25), 1), lag = c(0, 2), argvar = argvar, arglag = arglag)
coefficient_count <- ncol(basis)
block <- list(
  basis = list(lag = c(0, 2), argvar = argvar, arglag = arglag),
  coefficients = rep(0, coefficient_count),
  vcov = diag(0.01, coefficient_count),
  reference_temperature_c = 25,
  modelled_temperature_range_c = c(20, 40),
  n_training = 100L,
  n_lbw_events = 10L
)
bundle <- list(
  schema_version = 1L,
  model_family = "lbw_temperature_dlnm",
  country_code = "KE",
  outcome = "lbw",
  exposure = list(description = "test exposure", unit = "Celsius"),
  areas = list(
    Test = list(`1` = block, `2` = block, `3` = block)
  ),
  geography_levels = list(Test = "test_level"),
  provenance = list(version = "test", contains_respondent_rows = FALSE)
)

validate_compact_bundle(bundle)
at_reference <- score_compact_profile(block, c(25, 25, 25))
stopifnot(
  identical(at_reference$odds_ratio, 1),
  identical(at_reference$ci95_low, 1),
  identical(at_reference$ci95_high, 1),
  isTRUE(at_reference$on_training_support)
)
outside_support <- score_compact_profile(block, c(41, 30, 25))
stopifnot(
  identical(outside_support$on_training_support, FALSE),
  nzchar(outside_support$warning)
)
store <- list(path = "test.rds", bundle = bundle)
area_result <- score_compact_area(store, "test", 1, c(25, 25, 25))
stopifnot(identical(area_result$geography_level, "test_level"))

unsafe_bundle <- bundle
unsafe_bundle$areas$Test$`1`$respondents <- data.frame(id = 1)
unsafe_error <- tryCatch(
  {
    validate_compact_bundle(unsafe_bundle)
    ""
  },
  error = conditionMessage
)
stopifnot(grepl("respondent table", unsafe_error, fixed = TRUE))

message("Compact LBW scorer validates bundle, reference, and support behavior.")
