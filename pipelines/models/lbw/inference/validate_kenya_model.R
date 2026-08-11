#!/usr/bin/env Rscript
# Compare the sanitized Kenya bundle with its recovered fitted source.

suppressMessages(library(dlnm))
suppressMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 3) {
  stop(
    "Usage: validate_kenya_model.R SOURCE_RDS COMPACT_RDS OUTPUT_JSON",
    call. = FALSE
  )
}

script_arg <- commandArgs(trailingOnly = FALSE)
script_path <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)])
script_dir <- dirname(normalizePath(script_path, mustWork = TRUE))
source(file.path(script_dir, "score.R"))
source(file.path(script_dir, "compact_score.R"))

source_bundle <- readRDS(args[[1]])
compact_store <- load_compact_bundle(args[[2]])
vectors <- list()

for (area in names(compact_store$bundle$areas)) {
  for (window in 1:3) {
    sem <- sprintf("Sem%02d", window)
    suffix <- paste0(area, "_", sem)
    cb <- source_bundle[[paste0("cbTemp_", suffix)]]
    model <- source_bundle[[paste0("Model_", suffix)]]
    analysis <- source_bundle[[paste0("AnalysisData_", suffix)]]
    block <- compact_store$bundle$areas[[area]][[as.character(window)]]
    support <- block$modelled_temperature_range_c
    profile <- c(
      support[1] + 0.65 * diff(support),
      support[1] + 0.55 * diff(support),
      support[1] + 0.45 * diff(support)
    )

    original <- score_temperature_profile(cb, model, analysis, profile)
    compact <- score_compact_profile(block, profile)
    compared <- c("ref_temp", "odds_ratio", "ci95_low", "ci95_high")
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
  source_sha256 = compact_store$bundle$provenance$source_sha256,
  compact_filename = basename(args[[2]]),
  blocks_checked = length(vectors),
  parity = "passed",
  review_vectors = vectors
)
write_json(payload, args[[3]], auto_unbox = TRUE, pretty = TRUE, digits = NA)
message("Validated exact rounded parity for ", length(vectors), " model blocks")
