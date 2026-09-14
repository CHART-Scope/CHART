/**
 * Precision classification for confidence intervals.
 *
 * Mirrors ``backend/chart/risk/precision.py`` — keep the thresholds in
 * lockstep with that module so the badge shown by the frontend matches
 * the one the backend computes for the horizon cards.
 *
 * We classify precision by the CI ratio ``high / low`` rather than the
 * raw width because ratio is scale-invariant: the same thresholds work
 * for raw odds ratios (``1.03``) and milli-encoded values (``1030``).
 *
 * Thresholds agreed with the health team (Alessandro / Lucia, 2026-08):
 *   - HIGH — CI ratio ≤ 2.5 (no indication of substantial imprecision)
 *   - MODERATE — 2.5 < CI ratio ≤ 5 (potential imprecision)
 *   - LOW — CI ratio > 5 (imprecise / wide confidence interval)
 */

export type PrecisionLevel = "high" | "moderate" | "low";

export const HIGH_CI_RATIO_MAX = 2.5;
export const MODERATE_CI_RATIO_MAX = 5;

export function ciRatio(low: number, high: number): number {
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(low, high) / low;
}

export function precisionFromCi(low: number, high: number): PrecisionLevel {
  const ratio = ciRatio(low, high);
  if (ratio <= HIGH_CI_RATIO_MAX) return "high";
  if (ratio <= MODERATE_CI_RATIO_MAX) return "moderate";
  return "low";
}

const DEFAULT_LABEL: Record<PrecisionLevel, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
};

export function precisionLabel(level: PrecisionLevel): string {
  return DEFAULT_LABEL[level];
}
