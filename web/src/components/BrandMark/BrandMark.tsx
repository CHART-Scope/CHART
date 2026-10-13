import styles from "./BrandMark.module.css";

/**
 * The CHART mark: a heartbeat that climbs like a chart (health, data) inside
 * two isotherm arcs (climate), on the maroon tile. The wordmark sits beside it.
 *
 * `tone="light"` is for dark surfaces such as the top bar (lime line, no
 * tile edge); `tone="dark"` is for ivory and white pages.
 */
type Props = {
  size?: number;
  wordmark?: boolean;
  tone?: "dark" | "light";
  /** Animate the heartbeat and isotherms (the loader). */
  animated?: boolean;
  className?: string;
  /** Accessible name; omit when a visible label already names CHART. */
  title?: string;
};

export function BrandMark({
  size = 32,
  wordmark = false,
  tone = "dark",
  animated = false,
  className,
  title,
}: Props) {
  return (
    <span
      className={[
        styles.brand,
        styles[tone],
        animated ? styles.animated : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <svg
        className={styles.mark}
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
      >
        <rect className={styles.tile} x="1" y="1" width="46" height="46" rx="12" />
        <path
          className={`${styles.isotherm} ${styles.isothermOuter}`}
          d="M30 8.5a17 17 0 0 1 9.5 13"
        />
        <path
          className={`${styles.isotherm} ${styles.isothermInner}`}
          d="M29.5 14a11 11 0 0 1 5 8"
        />
        <path
          className={styles.pulse}
          pathLength={100}
          d="M8 30h8l4-9 5.5 15 4.5-11 3 4H40"
        />
        <circle className={styles.dot} cx="40" cy="29" r="2.2" />
      </svg>
      {wordmark ? <span className={styles.word}>CHART</span> : null}
    </span>
  );
}
