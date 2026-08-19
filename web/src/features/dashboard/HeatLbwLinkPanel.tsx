"use client";

import { useEffect, useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import { IconArray } from "@/components/IconArray";
import { PrecisionBadge } from "@/components/PrecisionBadge";
import { PrecisionInfoModal } from "@/components/PrecisionInfoModal";
import { Slider } from "@/components/Slider";
import { recordAuditEvent } from "@/lib/audit";
import {
  getPredictionRequest,
  listPredictionRequests,
  type PredictionRequest,
} from "@/lib/planningClient";
import { precisionFromCi, type PrecisionLevel } from "@/lib/precision";

import styles from "./HeatLbwLinkPanel.module.css";
import { relativeOddsChangePercent } from "./oddsRatio";
import { useWhatIfScore } from "./useWhatIfScore";

type Outcome = { code: string; label: string };
type District = { code: string; name: string; levelLabel?: string };

type Props = {
  /** Label for the state / whole-area default (e.g. "Madhya Pradesh (State)"). */
  stateLabel: string;
  districts?: readonly District[];
  modelAreaName?: string | null;
  parentSelectable?: boolean;
  outcome?: string;
  outcomeLabel?: string;
  outcomes?: readonly Outcome[];
  onOutcomeChange?: (code: string) => void;
  /** Figure rendered in each cell of the icon array. Defaults to the same
   * newborn pictogram the Risk-vs-Protection card uses so the two dashboard
   * panels read as a single visual family. */
  figure?: IconName;
  batchEnabled?: boolean;
  /** Selected district code, or ``null`` for the whole-state view. */
  activeAdminUnitCode?: string | null;
  onAdminUnitChange?: (code: string | null) => void;
  geographyId?: string;
  accessToken?: string;
  /** Bump this to force a re-fetch when a new run completes. */
  refreshKey?: string | null;
  /**
   * Demo prediction rendered when there is no live geography/token wired up
   * (used by Storybook so the pictogram / precision badge / stat sentence
   * preview the shape the real app renders). Ignored as soon as the live
   * what-if or batch prediction resolves.
   */
  previewPrediction?: {
    percent: number;
    ci95Low: number;
    ci95High: number;
  };
};

const FALLBACK_MIN_TEMP = 30;
const FALLBACK_MAX_TEMP = 45;
const DEFAULT_TEMP = 32;

/** Sentinel value the place select uses for the "whole state" option so we
 * can map it back to the null admin_unit convention this panel exposes. */
const STATE_ROOT_VALUE = "__state__";

export function HeatLbwLinkPanel({
  stateLabel,
  districts = [],
  modelAreaName = null,
  parentSelectable = true,
  outcome = "lbw",
  outcomeLabel = "low birth weight",
  outcomes,
  onOutcomeChange,
  figure = "newborn",
  batchEnabled = true,
  activeAdminUnitCode = null,
  onAdminUnitChange,
  geographyId,
  accessToken,
  refreshKey,
  previewPrediction,
}: Props) {
  const [temperature, setTemperature] = useState<number>(DEFAULT_TEMP);
  const [latest, setLatest] = useState<{
    oddsRatio: number;
    ci95Low: number;
    ci95High: number;
    referenceTemperatureC: number;
  } | null>(null);
  const [precisionModalOpen, setPrecisionModalOpen] = useState(false);

  // The district picker changes which model block (state vs division) is
  // hit. Route both the what-if score and the "latest completed run" lookup
  // through the same effective id the batch predictor uses so all views
  // stay on the same model.
  const effectiveGeographyId = activeAdminUnitCode ?? geographyId;
  const whatIf = useWhatIfScore({
    geographyId: effectiveGeographyId,
    accessToken,
    temperatureC: temperature,
    outcome,
  });

  const [modelRange, setModelRange] = useState<[number, number] | null>(null);
  useEffect(() => {
    setModelRange(null);
  }, [effectiveGeographyId]);
  useEffect(() => {
    const range = whatIf.score?.modelled_temperature_range_c;
    if (range && range.length === 2) setModelRange([range[0], range[1]]);
  }, [whatIf.score]);

  const sliderMin = modelRange?.[0] ?? FALLBACK_MIN_TEMP;
  const sliderMax = modelRange?.[1] ?? FALLBACK_MAX_TEMP;
  useEffect(() => {
    setTemperature((prev) => Math.min(sliderMax, Math.max(sliderMin, prev)));
  }, [sliderMin, sliderMax]);

  useEffect(() => {
    if (!batchEnabled) {
      setLatest(null);
      return;
    }
    if (!effectiveGeographyId || !accessToken) return;
    let cancelled = false;
    setLatest(null);
    listPredictionRequests(effectiveGeographyId, accessToken)
      .then(async (items) => {
        const done = items.find((item) => item.status === "completed");
        if (!done) return;
        const full = await getPredictionRequest(done.request_id, accessToken);
        if (!cancelled) setLatest(toLatestPrediction(full));
      })
      .catch(() => {
        // Latest prediction is a courtesy display; a failure keeps the
        // slider usable so we swallow errors silently.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, batchEnabled, effectiveGeographyId, refreshKey]);

  const activePrediction: {
    percent: number;
    oddsRatio: number | null;
    referenceTemperatureC: number | null;
    ci95Low: number | null;
    ci95High: number | null;
  } | null = whatIf.score
    ? {
        percent:
          whatIf.score.relative_odds_change_percent ??
          relativeOddsChangePercent(whatIf.score.odds_ratio),
        oddsRatio: whatIf.score.odds_ratio,
        referenceTemperatureC: whatIf.score.reference_temperature_c,
        ci95Low: whatIf.score.ci95_low,
        ci95High: whatIf.score.ci95_high,
      }
    : latest && batchEnabled
      ? {
          percent: relativeOddsChangePercent(latest.oddsRatio),
          oddsRatio: latest.oddsRatio,
          referenceTemperatureC: latest.referenceTemperatureC,
          ci95Low: latest.ci95Low,
          ci95High: latest.ci95High,
        }
      : previewPrediction
        ? {
            ...previewPrediction,
            oddsRatio: null,
            referenceTemperatureC: null,
          }
        : null;
  const showingRealResult = activePrediction !== null;

  const precisionLevel: PrecisionLevel | null =
    activePrediction &&
    activePrediction.ci95Low !== null &&
    activePrediction.ci95High !== null
      ? precisionFromCi(activePrediction.ci95Low, activePrediction.ci95High)
      : null;

  const showOutcomeSelect = Boolean(outcomes && outcomes.length > 1 && onOutcomeChange);
  const showPlaceSelect = parentSelectable || districts.length > 0;
  const placeValue = activeAdminUnitCode ?? STATE_ROOT_VALUE;

  return (
    <section className={styles.panel} aria-labelledby="heat-lbw-heading">
      <p className={styles.eyebrow}>Climate &amp; health linkage / correlation</p>

      <h2 id="heat-lbw-heading" className={styles.question}>
        How do the modelled odds{" "}
        <span className={styles.phrase}>
          of{" "}
          {showOutcomeSelect ? (
            <InlineSelect
              aria-label="Health outcome"
              value={outcome}
              onChange={(value) => onOutcomeChange?.(value)}
              options={outcomes!.map((o) => ({ value: o.code, label: o.label }))}
            />
          ) : (
            <span className={styles.inlineStatic}>{outcomeLabel.toLowerCase()}</span>
          )}
        </span>{" "}
        <span className={styles.phrase}>
          in{" "}
          {showPlaceSelect ? (
            <InlineSelect
              aria-label="Place"
              value={placeValue}
              onChange={(value) => {
                const next = value === STATE_ROOT_VALUE ? null : value;
                recordAuditEvent({
                  event_type: "district_switch",
                  geography_id: next ?? geographyId ?? null,
                  payload: {
                    from: activeAdminUnitCode,
                    to: next,
                    parent_geography_id: geographyId ?? null,
                  },
                });
                onAdminUnitChange?.(next);
              }}
              groups={[
                {
                  label: "Whole area",
                  options: [
                    {
                      value: STATE_ROOT_VALUE,
                      label: stateLabel,
                      disabled: !parentSelectable,
                    },
                  ],
                },
                districts.length > 0
                  ? {
                      label: districts[0].levelLabel
                        ? `${districts[0].levelLabel}s`
                        : "Districts",
                      options: districts.map((d) => ({
                        value: d.code,
                        label: d.levelLabel ? `${d.name} (${d.levelLabel})` : d.name,
                      })),
                    }
                  : null,
              ]}
            />
          ) : (
            <span className={styles.inlineStatic}>{stateLabel}</span>
          )}
        </span>{" "}
        compare with the fitted reference temperature?
      </h2>

      {modelAreaName ? (
        <p className={styles.modelScopeNote}>
          Health response calculated with the <strong>{modelAreaName}</strong> fitted
          model area.
        </p>
      ) : null}

      {showingRealResult ? (
        <div className={styles.iconArrayWrap}>
          <IconArray value={Math.abs(activePrediction.percent)} figure={figure} />
        </div>
      ) : (
        <div
          className={styles.skeletonGrid}
          role="status"
          aria-live="polite"
          aria-label="Preparing prediction"
        />
      )}

      {showingRealResult ? (
        <p className={styles.stat}>
          {activePrediction.oddsRatio === null ? (
            <>
              <strong>{Math.round(activePrediction.percent)}%</strong> modelled
              difference from the reference
            </>
          ) : activePrediction.percent === 0 ? (
            <>
              Modelled odds are <strong>the same</strong> as at the{" "}
              {activePrediction.referenceTemperatureC?.toFixed(1)}°C reference
            </>
          ) : (
            <>
              Modelled odds are{" "}
              <strong>{Math.abs(activePrediction.percent).toFixed(1)}%</strong>{" "}
              {activePrediction.percent < 0 ? "lower" : "higher"} than at the{" "}
              {activePrediction.referenceTemperatureC?.toFixed(1)}°C reference
            </>
          )}
        </p>
      ) : (
        <p className={styles.stat} data-loading>
          Preparing prediction…
        </p>
      )}

      {precisionLevel ? (
        <div className={styles.precisionRow}>
          <span className={styles.precisionLabel}>Precision:</span>
          <PrecisionBadge
            level={precisionLevel}
            onClick={() => setPrecisionModalOpen(true)}
          />
        </div>
      ) : null}

      <p className={styles.tempReadout} data-loading={whatIf.loading}>
        {`${temperature.toFixed(1)}°C`}
      </p>

      <div className={styles.sliderWrap}>
        <Slider
          min={sliderMin}
          max={sliderMax}
          step={0.1}
          value={temperature}
          onChange={setTemperature}
          formatReadout={(value) => `${value.toFixed(1)}°C`}
          ariaLabel="Explore temperature scenarios"
        />
        <div className={styles.sliderScale}>
          <span>{sliderMin.toFixed(1)}°C</span>
          <span>
            {typeof whatIf.score?.n_training === "number"
              ? `Observed sample: ${whatIf.score.n_training.toLocaleString()}`
              : "Fitted model range"}
          </span>
          <span>{sliderMax.toFixed(1)}°C</span>
        </div>
      </div>

      <p className={styles.footnote}>
        Drag the slider to compare the selected location&apos;s fitted association.
        Highlighting shows the magnitude of the change in modelled odds, not a count of
        individual cases.
      </p>

      <PrecisionInfoModal
        open={precisionModalOpen}
        onClose={() => setPrecisionModalOpen(false)}
        activeLevel={precisionLevel ?? undefined}
      />
    </section>
  );
}

type InlineSelectOption = { value: string; label: string; disabled?: boolean };
type InlineSelectGroup = { label: string; options: readonly InlineSelectOption[] };

function InlineSelect({
  value,
  onChange,
  options,
  groups,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: readonly InlineSelectOption[];
  groups?: readonly (InlineSelectGroup | null)[];
  "aria-label": string;
}) {
  const renderOption = (option: InlineSelectOption) => (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  );
  return (
    <span className={styles.inlineSelect}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {groups
          ? groups
              .filter((group): group is InlineSelectGroup => group !== null)
              .map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(renderOption)}
                </optgroup>
              ))
          : options?.map(renderOption)}
      </select>
      <Icon name="chevron-down" size={12} className={styles.inlineSelectChevron} />
    </span>
  );
}

function toLatestPrediction(run: PredictionRequest): {
  oddsRatio: number;
  ci95Low: number;
  ci95High: number;
  referenceTemperatureC: number;
} | null {
  const prediction = run.result?.prediction;
  if (!prediction) return null;
  return {
    oddsRatio: prediction.odds_ratio,
    ci95Low: prediction.ci95_low,
    ci95High: prediction.ci95_high,
    referenceTemperatureC: prediction.reference_temperature_c,
  };
}
