/** Convert a model odds ratio to the attributable-fraction-style percentage
 * used by both the headline and the highlighted newborn figures. */
export function affectedPercentFromOddsRatio(oddsRatio: number): number {
  if (!Number.isFinite(oddsRatio) || oddsRatio <= 1) return 0;
  return Math.round(Math.min(1, (oddsRatio - 1) / oddsRatio) * 1000) / 10;
}

/** Signed percentage change in modelled odds relative to the model's
 * reference temperature. Unlike attributable fraction, this preserves
 * associations below 1 instead of displaying them as 0%. */
export function relativeOddsChangePercent(oddsRatio: number): number {
  if (!Number.isFinite(oddsRatio) || oddsRatio <= 0) return 0;
  return Math.round((oddsRatio - 1) * 1000) / 10;
}
