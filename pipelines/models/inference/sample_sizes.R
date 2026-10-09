#!/usr/bin/env Rscript
# Print the fitted sample of every block in a compact model artifact as JSON:
#   {"<area>": {"<window>": {"n_training": .., "n_events": .., "n_subjects": ..}}}
# Windowed (LBW) artifacts nest blocks by pregnancy window; association
# artifacts (under-five) hold one block per area, reported under window "0".
# Used to fill the sample into results scored before it was stored.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1) stop("usage: sample_sizes.R <artifact.rds>")
bundle <- readRDS(args[[1]])
count <- function(value) if (is.null(value) || !length(value)) NULL else as.integer(value)
block_sample <- function(block) {
  list(
    n_training = count(block$n_training),
    n_events = count(if (!is.null(block$n_events)) block$n_events else block$n_lbw_events),
    n_subjects = count(block$n_subjects)
  )
}
out <- lapply(bundle$areas, function(area) {
  if (!is.null(area$coefficients)) list(`0` = block_sample(area))
  else lapply(area, block_sample)
})
cat(jsonlite::toJSON(out, auto_unbox = TRUE, null = "null"))
