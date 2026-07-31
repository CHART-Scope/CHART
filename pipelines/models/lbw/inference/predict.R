#!/usr/bin/env Rscript
# Direct DLNM inference for LBW ~ maximum temperature (Madhya Pradesh).

suppressMessages({
  library(dlnm)
  library(jsonlite)
  library(optparse)
})

script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) == 1) return(normalizePath(dirname(file_arg), mustWork = FALSE))
  normalizePath(".", mustWork = FALSE)
}

source(file.path(script_dir(), "score.R"))

opt_list <- list(
  make_option("--division-model", type = "character",
              help = "path to division-level fitted .rds"),
  make_option("--state-model", type = "character",
              help = "path to state-level fitted .rds"),
  make_option("--model", type = "character",
              help = "deprecated alias for --division-model"),
  make_option("--area", type = "character",
              help = "Madhya Pradesh or a division name (e.g. Bhopal)"),
  make_option("--division", type = "character",
              help = "deprecated alias for --area"),
  make_option("--trimester", type = "integer", help = "1, 2, or 3"),
  make_option("--tmax", type = "character",
              help = "comma-separated monthly tmax in Celsius, lag0,lag1,lag2"),
  make_option("--ref", type = "double", default = NA,
              help = "reference temperature; default depends on model level")
)
opt <- parse_args(OptionParser(option_list = opt_list))

demo_root <- normalizePath(file.path(script_dir(), ".."), mustWork = FALSE)
model_dir <- file.path(demo_root, "model")
division_path <- if (!is.null(opt$`division-model`)) {
  opt$`division-model`
} else if (!is.null(opt$model)) {
  opt$model
} else {
  file.path(model_dir, "MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds")
}
state_path <- if (!is.null(opt$`state-model`)) {
  opt$`state-model`
} else {
  file.path(model_dir, "MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds")
}

area <- opt$area %||% opt$division
stopifnot(!is.null(area), !is.null(opt$trimester), !is.null(opt$tmax))
if (identical(area, "MP") || identical(area, "Madhya Pradesh (state-wide)")) {
  area <- "Madhya Pradesh"
}

tmax_lag <- as.numeric(strsplit(opt$tmax, ",", fixed = TRUE)[[1]])
stopifnot(length(tmax_lag) == 3, all(is.finite(tmax_lag)))
stopifnot(opt$trimester %in% 1:3)

division_store <- load_division_bundle(division_path)
state_store <- load_state_bundle(state_path)
ref <- if (is.na(opt$ref)) NULL else opt$ref

out <- score_area(
  division_store = division_store,
  state_store = state_store,
  area = area,
  trimester = opt$trimester,
  tmax_lag = tmax_lag,
  ref = ref
)

`%||%` <- function(x, y) if (is.null(x)) y else x
cat(toJSON(out, auto_unbox = TRUE, pretty = TRUE), "\n", sep = "")
