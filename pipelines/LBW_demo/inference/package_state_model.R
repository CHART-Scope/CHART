#!/usr/bin/env Rscript
# Build MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds for the demo API.
#
# Sem01 reuses the original pooled state fit from Dlnlm_Objs.rds.
# Sem02 and Sem03 are derived once from the division bundle using the same
# whole-state specification as the original interactive analysis (.Rhistory).

suppressMessages({
  library(dlnm)
  library(splines)
})

script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) == 1) return(normalizePath(dirname(file_arg), mustWork = FALSE))
  normalizePath(".", mustWork = FALSE)
}

demo_root <- normalizePath(file.path(script_dir(), ".."), mustWork = FALSE)
division_path <- file.path(demo_root, "model", "MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds")
state_source_path <- Sys.getenv(
  "LBW_STATE_SOURCE",
  unset = file.path(demo_root, "model", "Dlnlm_Objs_source.rds")
)
output_path <- file.path(demo_root, "model", "MP_state_LBW_tmax_DHS2015-21_v1.0.0.rds")

if (!file.exists(division_path)) stop("Division model not found: ", division_path)
if (!file.exists(state_source_path)) {
  stop(
    "State source model not found: ", state_source_path,
    "\nCopy Dlnlm_Objs.rds from the shared LBW modelling project to model/Dlnlm_Objs_source.rds"
  )
}

division_bundle <- readRDS(division_path)
state_source <- readRDS(state_source_path)
divisions <- sort(unique(sub(
  "^cbTemp_(.+)_Sem[0-9]{2}$", "\\1",
  grep("^cbTemp_", names(division_bundle), value = TRUE)
)))

month_cols <- list(
  "1" = as.character(1:3),
  "2" = as.character(4:6),
  "3" = as.character(7:9)
)

fit_state_trimester <- function(trimester) {
  sem <- sprintf("Sem%02d", trimester)
  cols <- month_cols[[as.character(trimester)]]

  analysis_rows <- lapply(divisions, function(division) {
    analysis <- as.data.frame(division_bundle[[paste0("AnalysisData_", division, "_", sem)]])
    climate <- division_bundle[[paste0("ClimExposureLagMatrix_", division, "_", sem)]]
    analysis$mean_tmax_sem <- apply(climate[, cols, drop = FALSE], 1, mean, na.rm = TRUE)
    analysis
  })

  analysis_data <- do.call(rbind, analysis_rows)
  climate_matrix <- do.call(rbind, lapply(divisions, function(division) {
    as.data.frame(division_bundle[[paste0("ClimExposureLagMatrix_", division, "_", sem)]][, cols, drop = FALSE])
  }))

  keep <- complete.cases(climate_matrix)
  analysis_data <- analysis_data[keep, , drop = FALSE]
  climate_matrix <- as.matrix(climate_matrix[keep, , drop = FALSE])

  temp_mean <- apply(climate_matrix, 1, mean, na.rm = TRUE)
  knots_p50 <- quantile(temp_mean, 0.5, na.rm = TRUE)
  temp_basis <- crossbasis(
    climate_matrix,
    lag = 2,
    argvar = list(fun = "bs", knots = knots_p50, degree = 2),
    arglag = list(fun = "strata", breaks = 1)
  )
  Temp_Basis <- temp_basis

  analysis_data$mean_tmax_sem <- temp_mean
  analysis_data$residence_type <- as.factor(analysis_data$residence_type)
  analysis_data$highest_education <- as.factor(analysis_data$highest_education)
  analysis_data$child_sex <- as.factor(analysis_data$child_sex)
  analysis_data$wealth_index <- as.factor(analysis_data$wealth_index)
  model_formula <- as.formula(
    lbw ~ Temp_Basis +
      ns(birth_month, df = 4) +
      ns(RH, df = 3) +
      ns(age_woman, df = 3) +
      residence_type +
      highest_education +
      child_sex +
      BMI +
      total_children_ever_born +
      wealth_index
  )
  environment(model_formula) <- environment()

  model <- glm(model_formula, data = analysis_data, family = "binomial")
  list(
    cbTemp = Temp_Basis,
    Model = model,
    AnalysisData = analysis_data,
    ref_temp_default = 27
  )
}

state_bundle <- list(
  metadata = list(
    region = "Madhya Pradesh",
    geography_level = "state",
    outcome = "low birth weight",
    exposure = "monthly mean daily maximum 2m temperature (Celsius)",
    reference_temp_c = 27,
    reference_note = "Fixed 27 C reference used in the original whole-MP analysis.",
    training_surveys = "DHS India 2015-16 and 2019-21 (Madhya Pradesh births)",
    version = "1.0.0",
    source_files = list(
      sem01 = basename(state_source_path),
      sem02_sem03 = basename(division_path)
    )
  )
)

sem01_block <- list(
  cbTemp = state_source$Temp_Basis,
  Model = state_source$dlnm_model,
  AnalysisData = state_source$dlnm_model$data,
  ref_temp_default = 27
)
names(sem01_block) <- paste0(
  c("cbTemp", "Model", "AnalysisData", "ref_temp_default"),
  "_MP_Sem01"
)
state_bundle <- c(state_bundle, sem01_block)

for (trimester in 2:3) {
  block <- fit_state_trimester(trimester)
  names(block) <- paste0(names(block), sprintf("_MP_Sem%02d", trimester))
  state_bundle <- c(state_bundle, block)
}

dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
saveRDS(state_bundle, output_path)
message("[package_state_model] wrote ", output_path)
message("[package_state_model] state trimesters: 3; training n Sem01/Sem02/Sem03 = ",
        nrow(state_source$dlnm_model$data), "/",
        nrow(state_bundle$AnalysisData_MP_Sem02), "/",
        nrow(state_bundle$AnalysisData_MP_Sem03))
