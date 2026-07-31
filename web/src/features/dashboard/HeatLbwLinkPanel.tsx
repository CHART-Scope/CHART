"use client";

import { useState } from "react";

import { IconArray } from "@/components/IconArray";
import { PrecisionBadge, type PrecisionLevel } from "@/components/PrecisionBadge";
import { Slider } from "@/components/Slider";

import styles from "./HeatLbwLinkPanel.module.css";

type Props = {
  /** Label for the state / whole-area default (e.g. "Madhya Pradesh (State)"). */
  stateLabel: string;
  /** Districts the model covers under this state. */
  districts?: readonly { code: string; name: string }[];
  /** Selected district code, or ``null`` for the whole-state view. */
  activeAdminUnitCode?: string | null;
  onAdminUnitChange?: (code: string | null) => void;
};

const MIN_TEMP = 30;
const MAX_TEMP = 45;
const DEFAULT_TEMP = 32;

export function HeatLbwLinkPanel({
  stateLabel,
  districts = [],
  activeAdminUnitCode = null,
  onAdminUnitChange,
}: Props) {
  const [temperature, setTemperature] = useState<number>(DEFAULT_TEMP);
  const attributableFraction = attributableFractionAt(temperature);
  const precision: PrecisionLevel = precisionAt(temperature);

  return (
    <section className={styles.panel} aria-labelledby="heat-lbw-heading">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Link between heat and low-birth-weight</p>
        <label className={styles.viewingFor}>
          <span className={styles.viewingLabel}>Viewing for</span>
          <select
            value={activeAdminUnitCode ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onAdminUnitChange?.(value === "" ? null : value);
            }}
          >
            <option value="">{stateLabel}</option>
            {districts.map((district) => (
              <option key={district.code} value={district.code}>
                {district.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <h2 id="heat-lbw-heading" className={styles.visuallyHidden}>
        Attributable fraction and precision
      </h2>

      <div className={styles.iconArrayWrap}>
        <IconArray value={attributableFraction} figure="mother-baby" />
      </div>

      <p className={styles.stat}>
        <strong>{Math.round(attributableFraction)}%</strong> of all low birth weight
        cases may be attributable to maternal heat exposure
      </p>

      <div className={styles.precisionRow}>
        <span className={styles.precisionLabel}>Precision:</span>
        <PrecisionBadge level={precision} />
      </div>

      <p className={styles.tempReadout}>{temperature.toFixed(0)}°C</p>

      <div className={styles.sliderWrap}>
        <Slider
          min={MIN_TEMP}
          max={MAX_TEMP}
          step={0.5}
          value={temperature}
          onChange={setTemperature}
          formatReadout={(value) => `${value.toFixed(0)}°C`}
          ariaLabel="Explore temperature scenarios"
        />
        <div className={styles.sliderScale}>
          <span>{MIN_TEMP}°C</span>
          <span>{MAX_TEMP}°C</span>
        </div>
      </div>

      <p className={styles.footnote}>
        Drag the slider to see how hotter temperatures during pregnancy can increase the
        likelihood of low birth weight.
      </p>
    </section>
  );
}

/**
 * Placeholder attributable-fraction curve for the explorer slider.
 *
 * TODO: once erf_parameters is published for the geography, evaluate the
 * fitted spline at each temperature instead of this linear approximation.
 * The current shape is chosen so 32C shows ~11% (matching the design) and
 * higher temperatures rise plausibly.
 */
function attributableFractionAt(temperatureC: number): number {
  const clamped = Math.max(MIN_TEMP, Math.min(MAX_TEMP, temperatureC));
  const above30 = clamped - 30;
  const percent = 5 + above30 * 3;
  return Math.max(0, Math.min(100, percent));
}

function precisionAt(temperatureC: number): PrecisionLevel {
  if (temperatureC <= 33) return "moderate";
  if (temperatureC <= 39) return "low";
  return "low";
}
