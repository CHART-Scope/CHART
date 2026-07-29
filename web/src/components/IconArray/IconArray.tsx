import type { IconName } from "../Icon";

import styles from "./IconArray.module.css";

type Props = {
  /** Percentage 0–100 shown as filled cells */
  value: number;
  total?: number;
  caption?: string;
  captionSuffix?: string;
  /** Icon rendered in each cell. Defaults to the maternal-health pictogram. */
  figure?: IconName;
};

export function IconArray({
  value,
  total = 100,
  caption,
  captionSuffix = "increase in odds",
  figure = "mother-baby",
}: Props) {
  const on = Math.max(0, Math.min(total, Math.round(value)));
  return (
    <div>
      <div
        className={styles.grid}
        role="img"
        aria-label={`${on} of ${total} ${figure} figures highlighted`}
      >
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < on;
          return (
            <svg
              key={i}
              className={`${styles.cell} ${filled ? styles.cellOn : ""}`}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <use href={`#ic-${figure}`} />
            </svg>
          );
        })}
      </div>
      <div className={styles.caption}>
        <span className={styles.pct}>{caption ?? `${on}%`}</span>
        <div className={styles.desc}>{captionSuffix}</div>
      </div>
    </div>
  );
}
