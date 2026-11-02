"use client";

import { useState } from "react";

import { MONTH_LABELS, formatPercent } from "./exploreData";
import styles from "./explore.module.css";

export type ForecastPoint = {
  month: string;
  value: number | null;
  low: number | null;
  high: number | null;
  tmax: number | null;
};

const WIDTH = 320;
const HEIGHT = 96;
const PAD = { top: 10, right: 8, bottom: 6, left: 30 };

const monthName = (key: string) => MONTH_LABELS[Number(key.slice(5, 7)) - 1];

/**
 * The next six months as a line, in the seasonal cycle's style: the central
 * forecast, the range across forecast systems shaded behind it, and the heat
 * season marked. The month labels pick the map's month.
 */
export function ForecastLine({
  points,
  selected,
  onSelect,
  seasonMonths,
  systems,
}: {
  points: ForecastPoint[];
  selected: string | null;
  onSelect: (month: string) => void;
  seasonMonths: number[];
  systems: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const values = points
    .flatMap((point) => [point.value, point.high])
    .filter((value): value is number => value !== null);
  const top = Math.max(5, Math.ceil(Math.max(0, ...values) / 5) * 5);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = plotWidth / Math.max(1, points.length);
  const x = (index: number) => PAD.left + (index + 0.5) * step;
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
  const known = points
    .map((point, index) => ({ ...point, index }))
    .filter((point) => point.value !== null);
  const line = known
    .map(
      (point, n) =>
        `${n ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.value as number).toFixed(1)}`,
    )
    .join(" ");
  const ranged = known.filter((point) => point.low !== null && point.high !== null);
  const band = ranged.length
    ? [
        ...ranged.map(
          (point, n) =>
            `${n ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.high as number).toFixed(1)}`,
        ),
        ...ranged
          .slice()
          .reverse()
          .map(
            (point) =>
              `L${x(point.index).toFixed(1)},${y(point.low as number).toFixed(1)}`,
          ),
        "Z",
      ].join(" ")
    : "";
  const shown = hover ?? selected ?? points[0]?.month ?? null;
  const point = points.find((item) => item.month === shown);

  return (
    <figure className={styles.lineFigure}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Forecast share of cases linked to heat, next six months"
        onMouseLeave={() => setHover(null)}
      >
        {points.map((item, index) =>
          seasonMonths.includes(Number(item.month.slice(5, 7))) ? (
            <rect
              key={`season-${item.month}`}
              x={x(index) - step / 2}
              y={PAD.top}
              width={step}
              height={plotHeight}
              className={styles.lineSeason}
            />
          ) : null,
        )}
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
        {shown && points.some((item) => item.month === shown) && (
          <line
            x1={x(points.findIndex((item) => item.month === shown))}
            x2={x(points.findIndex((item) => item.month === shown))}
            y1={PAD.top}
            y2={PAD.top + plotHeight}
            className={styles.forecastGuide}
          />
        )}
        {band && <path d={band} className={styles.forecastBand} />}
        <path d={line} className={styles.lineCurrent} />
        {known.map((item) => (
          <circle
            key={item.month}
            cx={x(item.index)}
            cy={y(item.value as number)}
            r={item.month === selected ? 4.5 : 2.5}
            className={
              item.month === selected ? styles.forecastDotSelected : styles.lineDot
            }
          />
        ))}
        {points.map((item, index) => (
          <rect
            key={`hit-${item.month}`}
            x={x(index) - step / 2}
            y={0}
            width={step}
            height={HEIGHT}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(item.month)}
            onClick={() => onSelect(item.month)}
          />
        ))}
      </svg>
      <div
        className={styles.forecastMonths}
        role="group"
        aria-label="Forecast month"
        style={{
          paddingLeft: `${(PAD.left / WIDTH) * 100}%`,
          paddingRight: `${(PAD.right / WIDTH) * 100}%`,
        }}
      >
        {points.map((item, index) => {
          const firstOfYear =
            index === 0 ||
            item.month.slice(0, 4) !== points[index - 1].month.slice(0, 4);
          return (
            <button
              key={item.month}
              type="button"
              aria-pressed={item.month === selected}
              aria-label={`${monthName(item.month)} ${item.month.slice(0, 4)}`}
              onMouseEnter={() => setHover(item.month)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(item.month)}
            >
              {monthName(item.month)}
              <small>{firstOfYear ? item.month.slice(0, 4) : " "}</small>
            </button>
          );
        })}
      </div>
      <figcaption className={styles.lineCaption}>
        {point && (
          <>
            <strong>
              {monthName(point.month)} {point.month.slice(0, 4)}:{" "}
              {formatPercent(point.value)}
            </strong>
            {point.low !== null && point.high !== null && (
              <span>
                ({formatPercent(point.low)}–{formatPercent(point.high)})
              </span>
            )}
            {point.tmax !== null && <span> · {point.tmax.toFixed(1)} °C</span>}
          </>
        )}
        <span className={styles.lineKey}>
          <i className={styles.keyCurrent} /> Forecast
          {systems > 0 && (
            <>
              <i className={styles.keyBand} /> Range across {systems} forecast systems
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
