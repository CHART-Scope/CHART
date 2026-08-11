#!/usr/bin/env Rscript
# Prove the compact MP artifact scores identically to both legacy source files.

suppressMessages(library(dlnm))
suppressMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 4) {
  stop(
    "Usage: validate_mp_model.R STATE_RDS DIVISION_RDS COMPACT_RDS OUTPUT_JSON",
    call. = FALSE
  )
}

script_arg <- commandArgs(trailingOnly = FALSE)
script_path <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)])
script_dir <- dirname(normalizePath(script_path, mustWork = TRUE))
source(file.path(script_dir, "score.R"))
source(file.path(script_dir, "compact_score.R"))

state_store <- load_state_bundle(args[[1]])
division_store <- load_division_bundle(args[[2]])
compact_store <- load_compact_bundle(args[[3]])
vectors <- list()

for (area in names(compact_store$bundle$areas)) {
  for (window in 1:3) {
    legacy_block <- if (identical(area, "Madhya Pradesh")) {
      state_block(state_store, window)
    } else {
      division_block(division_store, area, window)
    }
    compact_block <- compact_store$bundle$areas[[area]][[as.character(window)]]
    support <- compact_block$modelled_temperature_range_c
    profile <- c(
      support[1] + 0.65 * diff(support),
      support[1] + 0.55 * diff(support),
      support[1] + 0.45 * diff(support)
    )
    original <- score_temperature_profile(
      legacy_block$cb,
      legacy_block$mod,
      legacy_block$ad,
      profile,
      ref_default = legacy_block$ref_default
    )
    compact <- score_compact_profile(compact_block, profile)
    compared <- c(
      "ref_temp", "odds_ratio", "ci95_low", "ci95_high",
      "modelled_temperature_min_c", "modelled_temperature_max_c"
    )
    if (!identical(original[compared], compact[compared])) {
      stop("Parity mismatch for ", area, " window ", window)
    }
    vectors[[length(vectors) + 1]] <- c(
      list(area = area, pregnancy_window = window),
      compact
    )
  }
}

payload <- list(
  schema_version = 1,
  compact_filename = basename(args[[3]]),
  blocks_checked = length(vectors),
  parity = "passed",
  review_vectors = vectors
)
write_json(payload, args[[4]], auto_unbox = TRUE, pretty = TRUE, digits = NA)
message("Validated exact rounded parity for ", length(vectors), " MP model blocks")
