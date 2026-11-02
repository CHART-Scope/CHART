import type { OutlookRatio } from "@/lib/heatOutlookClient";
import { precisionLabel, type PrecisionLevel } from "@/lib/precision";

import styles from "./explore.module.css";

const BARS: Record<PrecisionLevel, number> = { high: 3, moderate: 2, low: 1 };

/**
 * How firm an estimate is, as signal bars beside it: the dashboard's
 * precision classes (the 95% interval of the odds or risk ratio, thresholds
 * agreed with the health team), with the interval on hover.
 */
export function PrecisionMark({ ratio }: { ratio: OutlookRatio }) {
  const label = `${precisionLabel(ratio.precision)} precision: the 95% interval of the ${
    ratio.kind === "odds_ratio" ? "odds" : "risk"
  } ratio is ${ratio.low.toFixed(2)}–${ratio.high.toFixed(2)}`;
  return (
    <span
      className={styles.precision}
      data-level={ratio.precision}
      role="img"
      aria-label={label}
      title={label}
    >
      {[1, 2, 3].map((bar) => (
        <i key={bar} data-on={bar <= BARS[ratio.precision] || undefined} />
      ))}
    </span>
  );
}
