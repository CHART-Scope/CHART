import styles from "./Skeleton.module.css";

/**
 * A placeholder shaped like the thing that is coming.
 *
 * The point is that it is *shaped* like it. A generic spinner tells a reader
 * only that something is happening; a block the size of the heading, followed
 * by lines the width of the sentence, tells them what is about to arrive and
 * keeps the layout from jumping when it does.
 *
 * Everything here is inert to assistive technology - the container that owns
 * the skeleton announces the loading state once, rather than each bar
 * announcing itself.
 */

type SkeletonProps = {
  /** CSS width, e.g. "100%", "8rem", "60%". */
  width?: string;
  /** CSS height. Defaults to a single line of body text. */
  height?: string;
  /** Border radius; "full" for pills and circles. */
  radius?: "sm" | "md" | "full";
  className?: string;
};

export function Skeleton({
  width = "100%",
  height = "1rem",
  radius = "sm",
  className,
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.bar, styles[radius], className].filter(Boolean).join(" ")}
      style={{ width, height }}
    />
  );
}

/**
 * A run of lines standing in for a paragraph.
 *
 * The last line is short on purpose: a block of equal-length bars reads as a
 * table, not prose.
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <span className={[styles.stack, className].filter(Boolean).join(" ")}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? "62%" : "100%"}
          height="0.875rem"
        />
      ))}
    </span>
  );
}

/**
 * A card-shaped placeholder that matches the dashboard's card chrome.
 *
 * `label` is announced once for the whole card, which is why the bars inside
 * are hidden: a screen reader should hear "Loading the risk map", not twelve
 * anonymous graphics.
 */
export function SkeletonCard({
  label,
  children,
  className,
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[styles.card, className].filter(Boolean).join(" ")}
      role="status"
      aria-label={label}
    >
      {children ?? (
        <>
          <Skeleton width="7rem" height="0.75rem" />
          <Skeleton width="80%" height="1.25rem" />
          <SkeletonText lines={3} />
        </>
      )}
    </section>
  );
}
