/** The attributable share for an odds ratio, `(OR - 1) / OR`, as a percentage.
 * Only for Storybook previews, which have no stored result: the dashboard
 * shows the figure stored by core (`health_impact/derivation.py`), which is
 * the same formula with its below-reference rule applied. */
export function affectedPercentFromOddsRatio(oddsRatio: number): number {
  if (!Number.isFinite(oddsRatio) || oddsRatio <= 1) return 0;
  return Math.round(Math.min(1, (oddsRatio - 1) / oddsRatio) * 1000) / 10;
}
