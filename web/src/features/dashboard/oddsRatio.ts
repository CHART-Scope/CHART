/** Convert a model odds ratio to the attributable-fraction-style percentage
 * used by both the headline and the highlighted newborn figures. */
export function affectedPercentFromOddsRatio(oddsRatio: number): number {
  if (!Number.isFinite(oddsRatio) || oddsRatio <= 1) return 0;
  return Math.round(Math.min(1, (oddsRatio - 1) / oddsRatio) * 1000) / 10;
}

/** Signed percentage change in modelled odds relative to the model's
 * reference temperature. Mirrors ``backend/chart/climate/what_if.py``'s
 * ``_relative_odds_change_percent`` — including the positive-excess-only
 * clamp when temperature + reference + policy are all known. Below the
 * reference on a positive-excess-only release the return is 0.0, so
 * historical batch results and live what-ifs display the same number
 * for the same conditions. */
export function relativeOddsChangePercent(
  oddsRatio: number,
  options: {
    temperatureC?: number | null;
    referenceTemperatureC?: number | null;
    attributableFraction?: string | null;
  } = {},
): number {
  if (!Number.isFinite(oddsRatio) || oddsRatio <= 0) return 0;
  const { temperatureC, referenceTemperatureC, attributableFraction } = options;
  const clamp =
    attributableFraction === "positive_excess_only" &&
    typeof temperatureC === "number" &&
    typeof referenceTemperatureC === "number" &&
    Number.isFinite(temperatureC) &&
    Number.isFinite(referenceTemperatureC) &&
    temperatureC < referenceTemperatureC;
  if (clamp) return 0;
  return Math.round((oddsRatio - 1) * 1000) / 10;
}
