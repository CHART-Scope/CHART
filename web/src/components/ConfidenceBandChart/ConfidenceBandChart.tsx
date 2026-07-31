import type { ReactNode } from "react";
import { useId } from "react";

import styles from "./ConfidenceBandChart.module.css";

export type ChartPoint = {
  /** ISO YYYY-MM-DD or any string sortable as a calendar month. */
  x: string;
  /** Central value (any unit; the chart is unit-agnostic). */
  y: number;
  /** Optional lower/upper confidence bounds. */
  low?: number;
  high?: number;
};

export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  points: readonly ChartPoint[];
  /** Draw the confidence band under this series. Default true. */
  showBand?: boolean;
};

type Props = {
  series: readonly ChartSeries[];
  title?: string;
  yFormat?: (value: number) => string;
  xLabels?: readonly { x: string; label: string }[];
  ariaLabel: string;
  height?: number;
  emptyState?: ReactNode;
  loading?: boolean;
};

const WIDTH = 640;
const DEFAULT_HEIGHT = 260;
const PAD_LEFT = 44;
const PAD_RIGHT = 20;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;


export function ConfidenceBandChart({
  series,
  title,
  yFormat = (value) => `${Math.round(value)}`,
  xLabels,
  ariaLabel,
  height = DEFAULT_HEIGHT,
  emptyState,
  loading = false,
}: Props) {
  const titleId = useId();
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;

  const populated = series.filter((entry) => entry.points.length > 0);

  if (loading) {
    return (
      <div className={styles.wrap} data-loading="true">
        {title ? <p className={styles.title}>{title}</p> : null}
        <div className={styles.skeleton} style={{ height }} aria-live="polite">
          Loading forecast…
        </div>
      </div>
    );
  }

  if (populated.length === 0) {
    return (
      <div className={styles.wrap} data-empty="true">
        {title ? <p className={styles.title}>{title}</p> : null}
        <div className={styles.empty} style={{ height }}>
          {emptyState ?? "No forecast is available for this view yet."}
        </div>
      </div>
    );
  }

  const xValues = new Set<string>();
  const yValues: number[] = [];
  for (const entry of populated) {
    for (const point of entry.points) {
      xValues.add(point.x);
      yValues.push(point.y);
      if (point.low !== undefined) yValues.push(point.low);
      if (point.high !== undefined) yValues.push(point.high);
    }
  }
  const orderedX = Array.from(xValues).sort();
  const xIndex = new Map(orderedX.map((value, index) => [value, index]));

  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const yPad = (yMax - yMin) * 0.15 || 1;
  const yLow = yMin - yPad;
  const yHigh = yMax + yPad;

  const xScale = (value: string): number => {
    if (orderedX.length === 1) return PAD_LEFT + plotWidth / 2;
    const index = xIndex.get(value) ?? 0;
    return PAD_LEFT + (index * plotWidth) / (orderedX.length - 1);
  };
  const yScale = (value: number): number =>
    PAD_TOP + plotHeight - ((value - yLow) / (yHigh - yLow)) * plotHeight;

  const yTicks = buildYTicks(yLow, yHigh);
  const xTicks = xLabels ?? orderedX.map((x) => ({ x, label: shortMonth(x) }));

  return (
    <figure className={styles.wrap} aria-labelledby={title ? titleId : undefined}>
      {title ? (
        <figcaption id={titleId} className={styles.title}>
          {title}
        </figcaption>
      ) : null}
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        className={styles.svg}
      >
        {yTicks.map((tick) => (
          <g key={`grid-${tick}`}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yScale(tick)}
              y2={yScale(tick)}
              className={styles.gridLine}
            />
            <text
              x={PAD_LEFT - 6}
              y={yScale(tick) + 3}
              className={styles.axisLabel}
              textAnchor="end"
            >
              {yFormat(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text
            key={`x-${tick.x}`}
            x={xScale(tick.x)}
            y={height - PAD_BOTTOM + 18}
            className={styles.axisLabel}
            textAnchor="middle"
          >
            {tick.label}
          </text>
        ))}
        {populated.map((entry) => renderSeries(entry, xScale, yScale))}
      </svg>
      <ol className={styles.legend}>
        {populated.map((entry) => (
          <li key={entry.id}>
            <span
              aria-hidden
              className={styles.swatch}
              style={{ background: entry.color }}
            />
            {entry.label}
          </li>
        ))}
      </ol>
    </figure>
  );
}


function renderSeries(
  entry: ChartSeries,
  xScale: (value: string) => number,
  yScale: (value: number) => number,
): ReactNode {
  const points = [...entry.points].sort((a, b) => a.x.localeCompare(b.x));
  const showBand = entry.showBand !== false && points.every(
    (point) => point.low !== undefined && point.high !== undefined,
  );

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xScale(point.x)},${yScale(point.y)}`)
    .join(" ");

  const bandPath = showBand
    ? [
        ...points.map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${xScale(point.x)},${yScale(point.high!)}`,
        ),
        ...[...points]
          .reverse()
          .map((point) => `L${xScale(point.x)},${yScale(point.low!)}`),
        "Z",
      ].join(" ")
    : null;

  return (
    <g key={entry.id}>
      {bandPath ? (
        <path d={bandPath} fill={entry.color} fillOpacity={0.18} stroke="none" />
      ) : null}
      <path
        d={linePath}
        fill="none"
        stroke={entry.color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point) => (
        <circle
          key={`${entry.id}-${point.x}`}
          cx={xScale(point.x)}
          cy={yScale(point.y)}
          r={2.5}
          fill={entry.color}
        />
      ))}
    </g>
  );
}


function buildYTicks(yLow: number, yHigh: number): number[] {
  const range = yHigh - yLow;
  if (range <= 0) return [yLow];
  const stepBase = Math.pow(10, Math.floor(Math.log10(range / 4)));
  const candidateSteps = [stepBase, stepBase * 2, stepBase * 5, stepBase * 10];
  const step = candidateSteps.find((candidate) => range / candidate <= 6) ?? stepBase * 10;
  const first = Math.ceil(yLow / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= yHigh; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}


function shortMonth(iso: string): string {
  if (iso.length < 7) return iso;
  const year = iso.slice(0, 4);
  const monthIndex = Number.parseInt(iso.slice(5, 7), 10) - 1;
  if (Number.isNaN(monthIndex)) return iso;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[monthIndex] ?? "?"} ${year}`;
}
