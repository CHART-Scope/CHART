#!/usr/bin/env Rscript
# Direct DLNM inference for LBW ~ maximum temperature (Madhya Pradesh).
# The output is a conditional odds ratio, not an individual risk probability.

suppressMessages({
  library(dlnm)
  library(jsonlite)
  library(optparse)
})

opt_list <- list(
  make_option("--model",     type="character", help="path to fitted .rds"),
  make_option("--division",  type="character", help="MP division (e.g. Bhopal)"),
  make_option("--trimester", type="integer",   help="1, 2, or 3"),
  make_option("--tmax",      type="character", help="comma-separated monthly tmax in Celsius, lag0,lag1,lag2"),
  make_option("--ref",       type="double", default=NA,
              help="reference temperature; default = 25th percentile of training tmax")
)
opt <- parse_args(OptionParser(option_list=opt_list))

stopifnot(!is.null(opt$model), !is.null(opt$division),
          !is.null(opt$trimester), !is.null(opt$tmax))

tmax_lag <- as.numeric(strsplit(opt$tmax, ",", fixed=TRUE)[[1]])
stopifnot(length(tmax_lag) == 3, all(is.finite(tmax_lag)))
stopifnot(opt$trimester %in% 1:3)

sem     <- sprintf("Sem%02d", opt$trimester)
key_cb  <- sprintf("cbTemp_%s_%s",       opt$division, sem)
key_mod <- sprintf("Model_%s_%s",        opt$division, sem)
key_ad  <- sprintf("AnalysisData_%s_%s", opt$division, sem)

m <- readRDS(opt$model)
if (!(key_cb %in% names(m))) {
  stop(sprintf("No fitted block for division=%s trimester=%d",
               opt$division, opt$trimester))
}
cb  <- m[[key_cb]]; mod <- m[[key_mod]]; ad <- m[[key_ad]]

ref_temp <- if (is.na(opt$ref)) {
  as.numeric(quantile(ad$mean_tmax_sem, 0.25, na.rm=TRUE))
} else opt$ref

support <- as.numeric(attr(cb, "argvar")$Boundary.knots)
on_support <- all(tmax_lag >= support[1] & tmax_lag <= support[2]) &&
  ref_temp >= support[1] && ref_temp <= support[2]

argvar <- attr(cb, "argvar"); arglag <- attr(cb, "arglag"); lag_r <- attr(cb, "lag")
cb_new <- suppressWarnings(crossbasis(matrix(tmax_lag, 1), lag=lag_r, argvar=argvar, arglag=arglag))
cb_ref <- crossbasis(matrix(rep(ref_temp, 3), 1),        lag=lag_r, argvar=argvar, arglag=arglag)

tidx  <- grep("^Temp_Basis", names(coef(mod)))
btemp <- coef(mod)[tidx]
Vtemp <- vcov(mod)[tidx, tidx]

diff_row <- cb_new - cb_ref
log_or   <- as.numeric(diff_row %*% btemp)
se_log_or <- sqrt(as.numeric(diff_row %*% Vtemp %*% t(diff_row)))

cat(toJSON(list(
  region     = "MP",
  division   = opt$division,
  trimester  = opt$trimester,
  tmax_lag   = tmax_lag,
  ref_temp   = round(ref_temp, 2),
  metric     = "odds_ratio",
  odds_ratio = round(exp(log_or), 4),
  ci95_low   = round(exp(log_or - 1.96*se_log_or), 4),
  ci95_high  = round(exp(log_or + 1.96*se_log_or), 4),
  log_odds_ratio = round(log_or, 4),
  se_log_odds_ratio = round(se_log_or, 4),
  modelled_temperature_range_c = unname(round(support, 2)),
  on_training_support = on_support,
  warning = if (on_support) "" else paste0(
    "At least one input or the reference is outside the modelled range (",
    sprintf("%.2f to %.2f C). This is an extrapolated association.", support[1], support[2])
  ),
  n_training = nrow(ad),
  model_file = basename(opt$model)
), auto_unbox=TRUE, pretty=TRUE), "\n", sep="")
