#!/usr/bin/env Rscript

# Convert the recovered Kenya climate-zone conditional-logistic DLNMs into a
# compact, respondent-free artifact for CHART review. Mirrors
# package_mp_model.R; the source RDS remains outside Git.
#
# The source keys the zones without spaces ("CentralHighlands") while CHART's
# place set and boundary file use the display spelling ("Central Highlands").
# The bundle is written under the display spelling and records the source key
# on each block, so the mapping stays auditable.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) {
  stop("Usage: package_kenya_model.R <source-model.rds> <output-compact.rds>")
}

source_path <- normalizePath(args[[1]], mustWork = TRUE)
output_path <- args[[2]]
source <- readRDS(source_path)
if (anyDuplicated(names(source))) {
  duplicated_names <- unique(names(source)[duplicated(names(source))])
  stop(
    "Source model contains duplicate object names: ",
    paste(duplicated_names, collapse = ", ")
  )
}

# display name -> source key. Only these six zones are fitted.
zones <- c(
  "Central Highlands" = "CentralHighlands",
  "Coastal Strip" = "CoastalStrip",
  "Lake Victoria Basin & Western Highlands" = "LakeVictoriaBasin&WesternHighlands",
  "North-eastern" = "North-eastern",
  "North-western" = "North-western",
  "South-eastern" = "South-eastern"
)

source_object <- function(prefix, key) {
  name <- paste0(prefix, "_", key)
  value <- source[[name]]
  if (is.null(value)) stop("Recovered source is missing ", name)
  value
}

package_area <- function(zone_key) {
  key <- paste0(zone_key, "_Under_5_Mortality")
  model <- source_object("Model", key)
  cb <- source_object("cbTemp", key)
  prediction <- source_object("reducedCrossPred", key)
  data_name <- grep(
    paste0("Case_control_Clim_Exposure_", key, "$"),
    names(source),
    value = TRUE,
    fixed = FALSE
  )
  if (length(data_name) != 1) stop("Cannot identify fitted rows for ", key)
  fitted_rows <- source[[data_name]]
  temperature_terms <- grep("^Temp_Basis", names(coef(model)))
  if (!length(temperature_terms)) stop("No temperature coefficients for ", key)

  list(
    basis = list(
      lag = unname(attr(cb, "lag")),
      argvar = attr(cb, "argvar"),
      arglag = attr(cb, "arglag")
    ),
    coefficients = unname(as.numeric(coef(model)[temperature_terms])),
    vcov = unname(as.matrix(vcov(model)[temperature_terms, temperature_terms])),
    reference_temperature_c = unname(as.numeric(prediction$cen)),
    modelled_temperature_range_c = unname(as.numeric(
      attr(cb, "argvar")$Boundary.knots
    )),
    # Keep n_training as a compatibility alias for schema-1 consumers.
    n_model_rows = as.integer(model$n),
    n_training = as.integer(model$n),
    n_events = as.integer(model$nevent),
    n_subjects = as.integer(length(unique(fitted_rows$Child_ID))),
    source_block = key
  )
}

display_names <- names(zones)
bundle <- list(
  schema_version = 1L,
  model_family = "mortality_temperature_case_crossover_dlnm",
  country_code = "KE",
  outcome = "under_5_mortality",
  exposure = list(
    name = "daily_tmax_lag",
    description = "Daily maximum 2m air temperature at lag 0 through lag 3",
    unit = "Celsius",
    order = "newest_first",
    length = 4L,
    interval = "day"
  ),
  output = list(
    effect_measure = "odds_ratio",
    confidence_level = 0.95
  ),
  geography_levels = setNames(
    rep("climate_zone", length(display_names)), display_names
  ),
  areas = setNames(lapply(unname(zones), package_area), display_names),
  provenance = list(
    # Must equal the manifest's version: the R runtime refuses to load a
    # bundle whose internal version disagrees (api_registry.R:80). The MP
    # under-5 release already holds 0.1.0-review, and model_release is unique
    # on (module, outcome, version), so this one names its granularity.
    version = "0.1.0-climate-zone-review",
    source_filename = basename(source_path),
    source_sha256 = "f10bb60e902494374182b460274708dcd776a0ebddfed502ba83716b27e285b8",
    source_date = "2026-08-14",
    contains_respondent_rows = FALSE,
    review_status = "modeller-approval-required"
  )
)

# The declared arity must be what the fitted crossbasis actually expects.
for (name in names(bundle$areas)) {
  lag <- bundle$areas[[name]]$basis$lag
  expected <- as.integer(diff(as.numeric(lag)) + 1L)
  if (expected != bundle$exposure$length) {
    stop(
      "Block ", name, " expects ", expected,
      " values but the exposure declares ", bundle$exposure$length
    )
  }
}

dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
saveRDS(bundle, output_path, version = 3, compress = "xz")
message("Wrote ", normalizePath(output_path, mustWork = TRUE))
