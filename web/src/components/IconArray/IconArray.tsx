import type { IconName } from "../Icon";

import styles from "./IconArray.module.css";

type Figure = "square" | IconName;

type Props = {
  /** Percentage 0–100 shown as filled cells */
  value: number;
  total?: number;
  caption?: string;
  captionSuffix?: string;
  /**
   * What each cell renders. "square" (default) uses a plain colored block —
   * back-compat behavior. Any icon name renders that icon in each cell
   * (e.g. "mother-baby" for the maternal-heat-exposure pattern).
   */
  figure?: Figure;
};

export function IconArray({
  value,
  total = 100,
  caption,
  captionSuffix = "increase in odds",
  figure = "square",
}: Props) {
  const on = Math.max(0, Math.min(total, Math.round(value)));
  const usesIcon = figure !== "square";
  return (
    <div>
      <div
        className={`${styles.grid} ${usesIcon ? styles.gridTight : ""}`}
        role="img"
        aria-label={`${on}% filled`}
      >
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < on;
          const cellCls = `${styles.cell} ${filled ? styles.cellOn : ""} ${usesIcon ? styles.cellIcon : ""}`;
          if (!usesIcon) return <div key={i} className={cellCls} />;
          return (
            <svg key={i} className={cellCls} viewBox="0 0 24 24" aria-hidden>
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
