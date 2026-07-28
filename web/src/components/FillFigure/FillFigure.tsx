import type { ReactNode } from "react";

import styles from "./FillFigure.module.css";

export type FillFigureShape = "mother-baby" | "baby";

type Props = {
  /** Which silhouette to render as the fill target. */
  figure: FillFigureShape;
  /** 0–100. Percentage of the silhouette filled bottom-up. */
  value: number;
  /** Fill color for the filled portion. Defaults to var(--color-maroon). */
  color?: string;
  /** Color for the unfilled portion. Defaults to a subdued grey. */
  unfilledColor?: string;
  /** Rendered SVG size (square). */
  size?: number;
  /** Label above the figure (e.g. "Heat exposed"). */
  label?: ReactNode;
  /** Caption below (e.g. "72%" or freeform ReactNode). */
  caption?: ReactNode;
  /** Renders a small standalone baby silhouette below the main figure. */
  subFigure?: "baby" | null;
  className?: string;
};

const SHAPE_HREF: Record<FillFigureShape, string> = {
  "mother-baby": "#ic-mother-baby",
  baby: "#ic-baby",
};

export function FillFigure({
  figure,
  value,
  color = "var(--color-maroon)",
  unfilledColor = "var(--color-grey-mid)",
  size = 120,
  label,
  caption,
  subFigure = null,
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  // Fill grows bottom-up; SVG y-origin is top, so the filled rect starts at
  // (100 - clamped)% down and extends to the bottom.
  const filledY = 100 - clamped;
  const maskId = `fill-mask-${figure}-${Math.round(clamped)}`;

  return (
    <div className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      {label && <div className={styles.label}>{label}</div>}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={`${figure} filled ${clamped}%`}
      >
        <defs>
          <mask id={maskId}>
            {/* white = show, black = hide */}
            <rect width="24" height="24" fill="black" />
            <use href={SHAPE_HREF[figure]} fill="white" />
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          <rect width="24" height="24" fill={unfilledColor} />
          <rect
            x="0"
            y={filledY / (100 / 24)}
            width="24"
            height={clamped / (100 / 24)}
            fill={color}
          />
        </g>
      </svg>
      {subFigure && (
        <svg
          width={size * 0.32}
          height={size * 0.32}
          viewBox="0 0 24 24"
          className={styles.sub}
          aria-hidden
        >
          <use href={SHAPE_HREF[subFigure]} fill={color} />
        </svg>
      )}
      {caption && <div className={styles.caption}>{caption}</div>}
    </div>
  );
}
