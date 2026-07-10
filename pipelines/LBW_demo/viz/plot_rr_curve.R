#!/usr/bin/env Rscript
# Plots the exposure–response curve: conditional odds ratio of low birth weight vs mean tmax,
# for a chosen (division, trimester).  Produces a PNG.
#
# Usage:
#   Rscript viz/plot_rr_curve.R                       # defaults: Gwalior T1
#   Rscript viz/plot_rr_curve.R Gwalior 1
#   Rscript viz/plot_rr_curve.R Bhopal  1  viz/bhopal_T1.png

suppressMessages(library(dlnm))

script_dir <- function() {
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grep("^--file=", a)])
  if (length(f) == 1) return(normalizePath(dirname(f), mustWork = FALSE))
  normalizePath(".", mustWork = FALSE)
}
demo_root  <- normalizePath(file.path(script_dir(), ".."), mustWork = FALSE)
MODEL_PATH <- Sys.getenv("LBW_MODEL",
                        unset = file.path(demo_root, "model",
                                          "MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds"))

args <- commandArgs(trailingOnly = TRUE)
DIV  <- if (length(args) >= 1) args[1] else "Gwalior"
TRI  <- if (length(args) >= 2) as.integer(args[2]) else 1L
OUT  <- if (length(args) >= 3) args[3] else
        file.path(demo_root, "viz", sprintf("rr_curve_%s_T%d.png", DIV, TRI))

m       <- readRDS(MODEL_PATH)
sem     <- sprintf("Sem%02d", TRI)
cb      <- m[[sprintf("cbTemp_%s_%s",       DIV, sem)]]
mod     <- m[[sprintf("Model_%s_%s",        DIV, sem)]]
ad      <- m[[sprintf("AnalysisData_%s_%s", DIV, sem)]]
stopifnot(!is.null(cb), !is.null(mod), !is.null(ad))

ref_temp <- as.numeric(quantile(ad$mean_tmax_sem, 0.25, na.rm=TRUE))
tmin <- floor(quantile(ad$mean_tmax_sem, 0.01, na.rm=TRUE))
tmax <- ceiling(quantile(ad$mean_tmax_sem, 0.99, na.rm=TRUE))
grid <- seq(tmin, tmax, by = 0.25)

argvar <- attr(cb, "argvar"); arglag <- attr(cb, "arglag"); lag_r <- attr(cb, "lag")
tidx   <- grep("^Temp_Basis", names(coef(mod)))
btemp  <- coef(mod)[tidx]; Vtemp <- vcov(mod)[tidx, tidx]

# For each temperature t: assume constant tmax across the 3 trimester months.
cb_ref <- crossbasis(matrix(rep(ref_temp, 3), 1),
                     lag=lag_r, argvar=argvar, arglag=arglag)

score <- function(t) {
  cb_t <- crossbasis(matrix(rep(t, 3), 1),
                     lag=lag_r, argvar=argvar, arglag=arglag)
  d    <- cb_t - cb_ref
  lr   <- as.numeric(d %*% btemp)
  se   <- sqrt(as.numeric(d %*% Vtemp %*% t(d)))
  c(OR = exp(lr), lo = exp(lr - 1.96*se), hi = exp(lr + 1.96*se))
}
mat <- t(sapply(grid, score))

# Plot ------------------------------------------------------------------
dir.create(dirname(OUT), showWarnings = FALSE, recursive = TRUE)
png(OUT, width = 900, height = 600, res = 130)
op <- par(mar = c(4.5, 4.5, 3, 1))
ylim <- range(c(mat), 1, na.rm = TRUE, finite = TRUE)
ylim[2] <- min(ylim[2], 6)
ylim[1] <- max(ylim[1], 0.1)

plot(grid, mat[,"OR"], type="n", log="y", ylim=ylim,
     xlab = "Mean max temperature during trimester (°C)",
     ylab = "Conditional odds ratio of LBW",
     main = sprintf("%s — trimester %d\n(reference = %.1f °C, training p25)",
                    DIV, TRI, ref_temp))
polygon(c(grid, rev(grid)), c(mat[,"lo"], rev(mat[,"hi"])),
        col = adjustcolor("#0080AA", 0.20), border = NA)
abline(h = 1, lty = 3, col = "grey30")
abline(v = ref_temp, lty = 2, col = "grey40")
lines(grid, mat[,"OR"], lwd = 2.4, col = "#0080AA")
rug(ad$mean_tmax_sem, col = adjustcolor("black", 0.35), ticksize = -0.02)
legend("topleft", bty = "n", cex = 0.85,
       legend = c("Odds ratio (point estimate)", "95% CI", "reference (p25 training)"),
       lty    = c(1, NA, 2), lwd = c(2.4, NA, 1),
       col    = c("#0080AA", NA, "grey40"),
       fill   = c(NA, adjustcolor("#0080AA", 0.20), NA),
       border = NA)
par(op); dev.off()

message(sprintf("[viz] wrote %s", normalizePath(OUT)))
