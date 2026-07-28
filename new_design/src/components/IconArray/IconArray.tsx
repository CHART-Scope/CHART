import styles from "./IconArray.module.css";

type Props = {
  /** Percentage 0–100 shown as filled cells */
  value: number;
  total?: number;
  caption?: string;
  captionSuffix?: string;
};

export function IconArray({
  value,
  total = 100,
  caption,
  captionSuffix = "increase in odds",
}: Props) {
  const on = Math.max(0, Math.min(total, Math.round(value)));
  return (
    <div>
      <div className={styles.grid} role="img" aria-label={`${on}% filled`}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`${styles.cell} ${i < on ? styles.cellOn : ""}`} />
        ))}
      </div>
      <div className={styles.caption}>
        <span className={styles.pct}>{caption ?? `${on}%`}</span>
        <div className={styles.desc}>{captionSuffix}</div>
      </div>
    </div>
  );
}
