"use client";

import { useState } from "react";

import { MONTH_LABELS, formatPercent } from "./exploreData";
import styles from "./explore.module.css";

export type CyclePoint = { month: number; value: number | null; tmax: number | null };

const WIDTH = 320;
const HEIGHT = 132;
const PAD = { top: 12, right: 8, bottom: 20, left: 30 };

/**
 * The typical share of cases linked to heat in each calendar month, as a
 * line, for the chosen period against the baseline. The official heat
 * season is shaded behind it.
 */
export function SeasonalLine({
  current,
  baseline,
  currentLabel,
  baselineLabel,
  seasonMonths,
}: {
  current: CyclePoint[];
  baseline: CyclePoint[] | null;
  currentLabel: string;
  baselineLabel: string | null;
  seasonMonths: number[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = [...current, ...(baseline ?? [])]
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const top = Math.max(5, Math.ceil(Math.max(0, ...values) / 5) * 5);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (month: number) => PAD.left + ((month - 1) / 11) * plotWidth;
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const path = (points: CyclePoint[]) =>
    points
      .filter((point) => point.value !== null)
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${x(point.month).toFixed(1)},${y(point.value as number).toFixed(1)}`,
      )
      .join(" ");
  const step = plotWidth / 11;
  // The peak month until the reader points at another.
  const peak = current.reduce<CyclePoint | null>(
    (best, item) =>
      item.value !== null && (best === null || item.value > (best.value ?? -1))
        ? item
        : best,
    null,
  );
  const shown = hover ?? peak?.month ?? 1;
  const point = current.find((item) => item.month === shown);
  const base = baseline?.find((item) => item.month === shown);

  return (
    <figure className={styles.lineFigure}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Share of cases linked to heat by month, ${currentLabel}`}
        onMouseLeave={() => setHover(null)}
      >
        {seasonMonths.map((month) => (
          <rect
            key={month}
            x={x(month) - step / 2}
            y={PAD.top}
            width={step}
            height={plotHeight}
            className={styles.lineSeason}
            data-season-month={month}
          />
        ))}
        {[0, top / 2, top].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className={styles.lineGrid}
            />
            <text
              x={PAD.left - 4}
              y={y(tick) + 3}
              textAnchor="end"
              className={styles.lineTick}
            >
              {tick}%
            </text>
          </g>
        ))}
        {MONTH_LABELS.map((label, index) => (
          <text
            key={label}
            x={x(index + 1)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className={styles.lineTick}
          >
            {label[0]}
          </text>
        ))}
        {baseline && <path d={path(baseline)} className={styles.lineBaseline} />}
        <path d={path(current)} className={styles.lineCurrent} />
        {current.map((item) =>
          item.value === null ? null : (
            <circle
              key={item.month}
              cx={x(item.month)}
              cy={y(item.value)}
              r={item.month === shown ? 4 : 2.5}
              className={styles.lineDot}
            />
          ),
        )}
        {MONTH_LABELS.map((label, index) => (
          <rect
            key={`hit-${label}`}
            x={x(index + 1) - step / 2}
            y={0}
            width={step}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHover(index + 1)}
          >
            <title>{label}</title>
          </rect>
        ))}
      </svg>
      <figcaption className={styles.lineCaption}>
        <strong>
          {MONTH_LABELS[shown - 1]}: {formatPercent(point?.value)}
        </strong>
        {point?.tmax != null && <span> · {point.tmax.toFixed(1)} °C</span>}
        {base && baselineLabel && (
          <span>
            {" "}
            · {baselineLabel}: {formatPercent(base.value)}
          </span>
        )}
        <span className={styles.lineKey}>
          <i className={styles.keyCurrent} /> {currentLabel}
          {baselineLabel && (
            <>
              <i className={styles.keyBaseline} /> {baselineLabel}
            </>
          )}
          {seasonMonths.length > 0 && (
            <>
              <i className={styles.keySeason} /> Heat season
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
