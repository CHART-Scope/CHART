"use client";

import { useEffect, useMemo, useState } from "react";

import { InlineSelect } from "@/components/InlineSelect";

import styles from "./MonthYearPicker.module.css";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * How far back the picker will offer to go when the data itself does not say.
 * ERA5 reaches much further, but a planner choosing a month from a decade ago
 * is almost always a mis-click rather than an intent.
 */
export const DEFAULT_YEARS_BACK = 5;

export type MonthYearPickerProps = {
  /** Every `YYYY-MM` the caller knows about. Drives which months are live. */
  available: readonly string[];
  /** Currently selected `YYYY-MM`. */
  value: string;
  onChange: (month: string) => void;
  /** Months with an observation, shown as ready rather than merely selectable. */
  observed?: readonly string[];
  /**
   * `YYYY-MM` -> attributable percentage. Drives the heat tint, so a planner
   * can see which months carry the risk before clicking one.
   */
  intensity?: Readonly<Record<string, number>>;
  yearsBack?: number;
  idPrefix?: string;
};

function yearOf(key: string): number {
  return Number(key.slice(0, 4));
}

/**
 * A month grid with a year stepper above it.
 *
 * The grid is the part people actually read, so the year sits above it as a
 * single stepper rather than a second grid: a year is a rarer choice than a
 * month, and giving it equal weight would make the common case harder.
 */
export function MonthYearPicker({
  available,
  value,
  onChange,
  observed = [],
  intensity = {},
  yearsBack = DEFAULT_YEARS_BACK,
  idPrefix = "month-year",
}: MonthYearPickerProps) {
  const years = useMemo(() => {
    const fromData = [...new Set(available.map(yearOf))].filter(Number.isFinite);
    if (fromData.length === 0) return [new Date().getUTCFullYear()];
    const newest = Math.max(...fromData);
    // Offer the window the data covers, but never an unbounded scroll back.
    const floor = Math.max(Math.min(...fromData), newest - yearsBack);
    const span: number[] = [];
    for (let y = floor; y <= newest; y += 1) span.push(y);
    return span;
  }, [available, yearsBack]);

  const selectedYear = value ? yearOf(value) : years[years.length - 1];
  const [viewYear, setViewYear] = useState(selectedYear);
  useEffect(() => setViewYear(selectedYear), [selectedYear]);
  const year = years.includes(viewYear) ? viewYear : years[years.length - 1];

  const availableSet = useMemo(() => new Set(available), [available]);
  const observedSet = useMemo(() => new Set(observed), [observed]);

  // Four discrete bands rather than a continuous gradient: a planner reads
  // "worse than the others", not a precise value, and steps stay legible at
  // this size. Normalised across the observed range, not from zero, so the
  // worst month is distinct instead of sharing a band with its neighbours.
  const bandFor = useMemo(() => {
    const values = Object.values(intensity).filter((v) => Number.isFinite(v));
    if (values.length === 0) return () => 0;
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max <= 0) return () => 0;
    return (key: string) => {
      const v = intensity[key];
      if (v === undefined || v <= 0) return 0;
      if (max === min) return 2;
      const share = (v - min) / (max - min);
      return Math.min(4, Math.max(1, Math.ceil(share * 4)));
    };
  }, [intensity]);

  return (
    <div className={styles.picker}>
      <div className={styles.yearRow}>
        <InlineSelect
          menu
          aria-label="Year"
          value={String(year)}
          onChange={(value) => setViewYear(Number(value))}
          options={years.map((item) => ({ value: String(item), label: String(item) }))}
        />
      </div>

      <div className={styles.monthGrid} role="group" aria-label={`Months in ${year}`}>
        {MONTH_LABELS.map((label, i) => {
          const key = `${year}-${String(i + 1).padStart(2, "0")}`;
          const isAvailable = availableSet.has(key);
          const isSelected = key === value;
          return (
            <button
              key={key}
              type="button"
              id={`${idPrefix}-${key}`}
              className={styles.monthButton}
              aria-pressed={isSelected}
              data-selected={isSelected || undefined}
              data-observed={observedSet.has(key) || undefined}
              data-band={isAvailable ? bandFor(key) || undefined : undefined}
              disabled={!isAvailable}
              // A month with no data is shown, not hidden: the gap is
              // information, and a grid that changes shape is hard to scan.
              title={
                !isAvailable
                  ? "No data for this month"
                  : intensity[key] !== undefined
                    ? `${intensity[key].toFixed(1)}% attributable`
                    : undefined
              }
              onClick={() => onChange(key)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
