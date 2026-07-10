#!/usr/bin/env Rscript
# HTTP inference API for the fitted Madhya Pradesh LBW temperature model.
#
# This service accepts three user-supplied monthly mean daily-maximum
# temperatures. It deliberately does not retrieve climate data or manufacture
# scenarios: climate ingestion belongs in a separate, versioned data pipeline.

suppressMessages({
  library(dlnm)
  library(plumber)
  library(jsonlite)
})

script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) == 1) return(normalizePath(dirname(file_arg), mustWork = FALSE))
  normalizePath(".", mustWork = FALSE)
}

demo_root <- normalizePath(file.path(script_dir(), ".."), mustWork = FALSE)
model_path <- Sys.getenv(
  "LBW_MODEL",
  unset = file.path(demo_root, "model", "MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds")
)
port <- as.integer(Sys.getenv("PORT", "8000"))
host <- Sys.getenv("HOST", "127.0.0.1")

if (!file.exists(model_path)) stop("Model file not found: ", model_path)

model_bundle <- readRDS(model_path)
divisions <- sort(unique(sub(
  "^cbTemp_(.+)_Sem[0-9]+$", "\\1",
  grep("^cbTemp_", names(model_bundle), value = TRUE)
)))

model_block <- function(division, trimester) {
  if (!is.character(division) || length(division) != 1 || !(division %in% divisions)) {
    stop("division must be one of: ", paste(divisions, collapse = ", "))
  }
  if (length(trimester) != 1 || is.na(trimester) || !(trimester %in% 1:3)) {
    stop("trimester must be 1 (last), 2 (middle), or 3 (earliest)")
  }

  sem <- sprintf("Sem%02d", trimester)
  cb <- model_bundle[[sprintf("cbTemp_%s_%s", division, sem)]]
  mod <- model_bundle[[sprintf("Model_%s_%s", division, sem)]]
  ad <- model_bundle[[sprintf("AnalysisData_%s_%s", division, sem)]]
  if (is.null(cb) || is.null(mod) || is.null(ad)) stop("Model block is incomplete")
  list(cb = cb, mod = mod, ad = ad)
}

score_one <- function(division, trimester, tmax_lag, ref = NULL) {
  trimester <- as.integer(trimester)
  tmax_lag <- as.numeric(tmax_lag)
  if (length(tmax_lag) != 3 || any(!is.finite(tmax_lag))) {
    stop("tmax_lag must contain exactly three finite Celsius values: lag 0, lag 1, lag 2")
  }
  if (!is.null(ref) && (length(ref) != 1 || !is.finite(ref))) {
    stop("ref must be one finite Celsius value when supplied")
  }

  block <- model_block(division, trimester)
  cb <- block$cb
  mod <- block$mod
  ad <- block$ad
  ref_temp <- if (is.null(ref)) {
    as.numeric(quantile(ad$mean_tmax_sem, 0.25, na.rm = TRUE))
  } else {
    as.numeric(ref)
  }

  support <- as.numeric(attr(cb, "argvar")$Boundary.knots)
  on_support <- all(tmax_lag >= support[1] & tmax_lag <= support[2]) &&
    ref_temp >= support[1] && ref_temp <= support[2]

  cb_new <- suppressWarnings(crossbasis(
    matrix(tmax_lag, 1),
    lag = attr(cb, "lag"), argvar = attr(cb, "argvar"), arglag = attr(cb, "arglag")
  ))
  cb_ref <- crossbasis(
    matrix(rep(ref_temp, 3), 1),
    lag = attr(cb, "lag"), argvar = attr(cb, "argvar"), arglag = attr(cb, "arglag")
  )
  temperature_terms <- grep("^Temp_Basis", names(coef(mod)))
  difference <- cb_new - cb_ref
  log_or <- as.numeric(difference %*% coef(mod)[temperature_terms])
  se_log_or <- sqrt(as.numeric(
    difference %*% vcov(mod)[temperature_terms, temperature_terms] %*% t(difference)
  ))

  list(
    region = "MP",
    division = division,
    trimester = trimester,
    exposure_metric = "monthly mean of daily maximum 2m temperature (Celsius)",
    tmax_lag = unname(tmax_lag),
    ref_temp = round(ref_temp, 2),
    metric = "odds_ratio",
    odds_ratio = round(exp(log_or), 4),
    ci95_low = round(exp(log_or - 1.96 * se_log_or), 4),
    ci95_high = round(exp(log_or + 1.96 * se_log_or), 4),
    modelled_temperature_range_c = unname(round(support, 2)),
    on_training_support = on_support,
    warning = if (on_support) "" else paste0(
      "At least one input or the reference temperature is outside this model block's ",
      sprintf("training range (%.2f to %.2f C). This is an extrapolated association.", support[1], support[2])
    ),
    n_training = nrow(ad),
    model_file = basename(model_path),
    model_version = "1.0.0"
  )
}

json <- plumber::serializer_unboxed_json()

pr <- plumber::pr() |>
  plumber::pr_set_serializer(json) |>
  plumber::pr_get("/health", function() {
    list(status = "ok", model = basename(model_path), divisions = length(divisions))
  }, serializer = json) |>
  plumber::pr_get("/divisions", function() {
    list(region = "MP", divisions = divisions)
  }, serializer = json) |>
  plumber::pr_post("/predict", function(req, res) {
    tryCatch({
      body <- jsonlite::fromJSON(req$postBody, simplifyVector = TRUE)
      score_one(
        division = body$division,
        trimester = body$trimester,
        tmax_lag = body$tmax_lag,
        ref = if (!is.null(body$ref)) body$ref else NULL
      )
    }, error = function(error) {
      res$status <- 400
      list(error = conditionMessage(error))
    })
  }, serializer = json) |>
  plumber::pr_static("/ui", file.path(demo_root, "web"))

message(sprintf("[api] loaded %s : %d divisions x 3 trimesters", basename(model_path), length(divisions)))
message(sprintf("[api] listening on http://%s:%d", host, port))
pr$run(host = host, port = port)
