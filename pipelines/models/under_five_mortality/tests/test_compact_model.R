#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)
artifact <- if (length(args)) args[[1]] else file.path(
  "pipelines", "models", "under_five_mortality", "model",
  "IN_MP_under5_mortality_tmax_v0.1.0-review.rds"
)
source(file.path("pipelines", "models", "lbw", "inference", "compact_score.R"))
store <- load_compact_bundle(artifact)
stopifnot(
  identical(store$bundle$outcome, "under_5_mortality"),
  identical(names(store$bundle$areas), c(
    "Bhopal", "Chambal", "Gwalior", "Indore", "Jabalpur",
    "Narmadapuram", "Rewa", "Sagar", "Shahdol", "Ujjain"
  )),
  identical(store$bundle$areas$Bhopal$n_training, 943L),
  identical(store$bundle$areas$Bhopal$n_events, 215L),
  identical(store$bundle$areas$Bhopal$n_subjects, 215L)
)
reference <- store$bundle$areas$Bhopal$reference_temperature_c
score <- score_compact_association(store, "Bhopal", rep(reference, 4))
stopifnot(
  identical(score$odds_ratio, 1),
  identical(score$ci95_low, 1),
  identical(score$ci95_high, 1),
  identical(score$effect_measure, "odds_ratio"),
  identical(score$n_model_rows, 943L),
  identical(score$n_training, 943L),
  identical(score$n_events, 215L),
  identical(score$n_subjects, 215L)
)
message("Compact MP under-five mortality artifact validates and scores.")
