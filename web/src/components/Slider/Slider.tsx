"use client";

import type { ChangeEvent } from "react";

import styles from "./Slider.module.css";

type Props = {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  formatReadout?: (v: number) => string;
  formatLabel?: (v: number) => string;
  ariaLabel?: string;
};

export function Slider({
  min,
  max,
  step = 0.1,
  value,
  onChange,
  formatReadout = (v) => v.toFixed(1),
  formatLabel = (v) => `${v}`,
  ariaLabel,
}: Props) {
  const fillPct = ((value - min) / (max - min)) * 100;
  const background = `linear-gradient(to right, var(--color-nexus) ${fillPct}%, var(--color-grey-mid) ${fillPct}%)`;
  const handle = (e: ChangeEvent<HTMLInputElement>) =>
    onChange(parseFloat(e.currentTarget.value));

  return (
    <div className={styles.wrap}>
      <div className={styles.readout}>{formatReadout(value)}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handle}
        className={styles.range}
        style={{ background }}
        aria-label={ariaLabel}
      />
      <div className={styles.labels}>
        <span>{formatLabel(min)}</span>
        <span>{formatLabel(max)}</span>
      </div>
    </div>
  );
}
