#!/usr/bin/env Rscript

# Convert the recovered fitted conditional-logistic DLNMs into a compact,
# respondent-free artifact for CHART review. The source RDS remains outside Git.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) {
  stop("Usage: package_mp_model.R <source-model.rds> <output-compact.rds>")
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
areas <- c(
  "Bhopal", "Chambal", "Gwalior", "Indore", "Jabalpur",
  "Narmadapuram", "Rewa", "Sagar", "Shahdol", "Ujjain"
)

source_object <- function(prefix, key) {
  name <- paste0(prefix, "_", key)
  value <- source[[name]]
  if (is.null(value)) stop("Recovered source is missing ", name)
  value
}

package_area <- function(area) {
  key <- paste0(area, "_Under_5_Mortality")
  model <- source_object("Model", key)
  cb <- source_object("cbTemp", key)
  prediction <- source_object("reducedCrossPred", key)
  data_name <- grep(
    paste0("Case_control_Clim_Exposure_", key, "$"),
    names(source),
    value = TRUE
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

bundle <- list(
  schema_version = 1L,
  model_family = "mortality_temperature_case_crossover_dlnm",
  country_code = "IN",
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
  geography_levels = setNames(rep("division", length(areas)), areas),
  areas = setNames(lapply(areas, package_area), areas),
  provenance = list(
    version = "0.1.0-review",
    source_filename = basename(source_path),
    source_sha256 = "d1276d946748047d9e086f290c1be106dbb4e7429f2be2059106e9aa8c552d24",
    source_date = "2026-08-12",
    contains_respondent_rows = FALSE,
    review_status = "modeller-approval-required"
  )
)

dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
saveRDS(bundle, output_path, version = 3, compress = "xz")
message("Wrote ", normalizePath(output_path, mustWork = TRUE))
