import type { OutlookRatio } from "@/lib/heatOutlookClient";
import { precisionLabel, type PrecisionLevel } from "@/lib/precision";

import styles from "./explore.module.css";

const BARS: Record<PrecisionLevel, number> = { high: 3, moderate: 2, low: 1 };

const MEANING: Record<PrecisionLevel, string> = {
  high: "A narrow interval: the estimate is firm.",
  moderate: "A wider interval: read the figure with some care.",
  low: "A wide interval: treat the figure as a rough guide.",
};

/**
 * How firm an estimate is, as signal bars beside it: the dashboard's
 * precision classes (the 95% interval of the odds or risk ratio, thresholds
 * agreed with the health team), with a small card on hover or focus.
 */
export function PrecisionMark({
  ratio,
  align = "start",
}: {
  ratio: OutlookRatio;
  /** "end" opens the card leftward, for marks near the right edge. */
  align?: "start" | "end";
}) {
  const level = precisionLabel(ratio.precision);
  const measure = ratio.kind === "odds_ratio" ? "odds" : "risk";
  const interval = `${ratio.low.toFixed(2)}–${ratio.high.toFixed(2)}`;
  return (
    <span
      className={styles.precision}
      data-level={ratio.precision}
      data-align={align}
      role="img"
      tabIndex={0}
      aria-label={`${level} precision: the 95% interval of the ${measure} ratio is ${interval}`}
    >
      {[1, 2, 3].map((bar) => (
        <i key={bar} data-on={bar <= BARS[ratio.precision] || undefined} />
      ))}
      <span className={styles.precisionCard} aria-hidden="true">
        <strong>{level} precision</strong>
        <span>
          95% interval of the {measure} ratio: <b>{interval}</b>
        </span>
        <small>{MEANING[ratio.precision]}</small>
      </span>
    </span>
  );
}
