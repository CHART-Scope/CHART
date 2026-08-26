"use client";

import { useEffect, useState } from "react";

import { type IconName } from "@/components/Icon";
import { IconArray } from "@/components/IconArray";
import { PrecisionBadge } from "@/components/PrecisionBadge";
import { PrecisionInfoModal } from "@/components/PrecisionInfoModal";
import { Slider } from "@/components/Slider";
import {
  getPredictionRequest,
  listPredictionRequests,
  type PredictionRequest,
} from "@/lib/planningClient";
import { precisionFromCi, type PrecisionLevel } from "@/lib/precision";

import styles from "./HeatLbwLinkPanel.module.css";
import { affectedPercentFromOddsRatio, relativeOddsChangePercent } from "./oddsRatio";
import { useWhatIfScore } from "./useWhatIfScore";

type Props = {
  /** Label for the currently-viewed place (e.g. "Bhopal Division",
   * "Madhya Pradesh (State)"). Rendered as static text in the question
   * header — the actual switching lives in DashboardContextBar. */
  placeLabel: string;
  modelAreaName?: string | null;
  outcome?: string;
  outcomeLabel?: string;
  /** Figure rendered in each cell of the icon array. Defaults to the same
   * newborn pictogram the Risk-vs-Protection card uses so the two dashboard
   * panels read as a single visual family. */
  figure?: IconName;
  batchEnabled?: boolean;
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
    /** Populate to exercise the OR-dependent branches of the stat sentence
     * (at-reference, above-reference, or the positive-excess-only
     * "no heat-attributable excess" line). */
    oddsRatio?: number | null;
    referenceTemperatureC?: number | null;
  };
};

const FALLBACK_MIN_TEMP = 30;
const FALLBACK_MAX_TEMP = 45;
const DEFAULT_TEMP = 32;

export function HeatLbwLinkPanel({
  placeLabel,
  modelAreaName = null,
  outcome = "lbw",
  outcomeLabel = "low birth weight",
  figure = "newborn",
  batchEnabled = true,
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

  // The dashboard now owns place selection (see DashboardContextBar) and
  // navigates whenever the user picks a different area, so the panel
  // just uses the geographyId it was handed.
  const whatIf = useWhatIfScore({
    geographyId,
    accessToken,
    temperatureC: temperature,
    outcome,
  });

  // Derive the range and reference straight off the current whatIf
  // score rather than mirroring them into state — mirroring lagged by
  // one render and triggered a *second* what-if fetch every time the
  // clamp bumped `temperature` upward. Reading them inline means the
  // clamp fires in the same tick the score arrives, with no second
  // round-trip. Both are guarded with Number.isFinite so a NaN in the
  // payload can't collapse the slider bounds.
  const rangeFromScore = whatIf.score?.modelled_temperature_range_c;
  const modelRange: [number, number] | null =
    rangeFromScore &&
    rangeFromScore.length === 2 &&
    Number.isFinite(rangeFromScore[0]) &&
    Number.isFinite(rangeFromScore[1])
      ? [rangeFromScore[0], rangeFromScore[1]]
      : null;
  const refFromScore = whatIf.score?.reference_temperature_c;
  const refTemp = Number.isFinite(refFromScore) ? (refFromScore as number) : null;

  // Below the model's reference temperature the exposure-response is
  // outside the paper's interpreted scope, so the slider is clamped to
  // start at the reference. Falls back to the raw model support when the
  // reference has not arrived yet.
  const sliderMin = Math.max(
    refTemp ?? -Infinity,
    modelRange?.[0] ?? FALLBACK_MIN_TEMP,
  );
  const sliderMax = modelRange?.[1] ?? FALLBACK_MAX_TEMP;
  useEffect(() => {
    setTemperature((prev) => Math.min(sliderMax, Math.max(sliderMin, prev)));
  }, [sliderMin, sliderMax]);

  useEffect(() => {
    if (!batchEnabled) {
      setLatest(null);
      return;
    }
    if (!geographyId || !accessToken) return;
    let cancelled = false;
    setLatest(null);
    listPredictionRequests(geographyId, accessToken)
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
  }, [accessToken, batchEnabled, geographyId, refreshKey]);

  const activePrediction: {
    percent: number;
    /** AF (individual-level attributable fraction among the exposed) —
     * shown as a small optional line beneath the main odds sentence when
     * OR > 1. `null` if no OR is available (preview cards). */
    afPercent: number | null;
    oddsRatio: number | null;
    referenceTemperatureC: number | null;
    ci95Low: number | null;
    ci95High: number | null;
  } | null = whatIf.score
    ? {
        percent:
          whatIf.score.relative_odds_change_percent ??
          relativeOddsChangePercent(whatIf.score.odds_ratio),
        afPercent:
          whatIf.score.attributable_fraction_percent ??
          affectedPercentFromOddsRatio(whatIf.score.odds_ratio),
        oddsRatio: whatIf.score.odds_ratio,
        referenceTemperatureC: whatIf.score.reference_temperature_c,
        ci95Low: whatIf.score.ci95_low,
        ci95High: whatIf.score.ci95_high,
      }
    : latest && batchEnabled
      ? {
          percent: relativeOddsChangePercent(latest.oddsRatio),
          afPercent: affectedPercentFromOddsRatio(latest.oddsRatio),
          oddsRatio: latest.oddsRatio,
          referenceTemperatureC: latest.referenceTemperatureC,
          ci95Low: latest.ci95Low,
          ci95High: latest.ci95High,
        }
      : previewPrediction
        ? {
            percent: previewPrediction.percent,
            afPercent:
              typeof previewPrediction.oddsRatio === "number"
                ? affectedPercentFromOddsRatio(previewPrediction.oddsRatio)
                : null,
            ci95Low: previewPrediction.ci95Low,
            ci95High: previewPrediction.ci95High,
            oddsRatio: previewPrediction.oddsRatio ?? null,
            referenceTemperatureC: previewPrediction.referenceTemperatureC ?? null,
          }
        : null;
  const showingRealResult = activePrediction !== null;

  const precisionLevel: PrecisionLevel | null =
    activePrediction &&
    activePrediction.ci95Low !== null &&
    activePrediction.ci95High !== null
      ? precisionFromCi(activePrediction.ci95Low, activePrediction.ci95High)
      : null;

  // Outcome + place switchers moved to DashboardContextBar — the panel
  // now reads as a static sentence anchored to the top bar's context.
  // Outcome + place switchers live in DashboardContextBar — the panel
  // reads as a static sentence anchored to whatever the top bar has
  // selected. `placeLabel` is passed from the dashboard page as the
  // resolved leaf name (division, county, state).

  return (
    <section className={styles.panel} aria-labelledby="heat-lbw-heading">
      <p className={styles.eyebrow}>Climate &amp; health linkage / correlation</p>

      <h2 id="heat-lbw-heading" className={styles.question}>
        How do the modelled odds{" "}
        <span className={styles.phrase}>
          of{" "}
          <span className={styles.inlineStatic}>{outcomeLabel.toLowerCase()}</span>
        </span>{" "}
        <span className={styles.phrase}>
          in{" "}
          <span className={styles.inlineStatic}>{placeLabel}</span>
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
          {/* Icon array fills on |relative odds change|. That matches the
              stat sentence below one-for-one so the visual and the number
              tell the same story; AF was tried here but clamping to 0
              whenever OR<=1 made several divisions render as empty grids
              (e.g. Bhopal at 38.5°C, Sagar at 40°C) which the reader
              interpreted as "no signal" rather than "unusual fit". */}
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
        <>
          <p className={styles.stat}>
            {activePrediction.oddsRatio === null ? (
              <>
                <strong>{Math.round(activePrediction.percent)}%</strong> modelled
                difference from the reference
              </>
            ) : activePrediction.referenceTemperatureC !== null &&
              temperature < activePrediction.referenceTemperatureC &&
              activePrediction.percent === 0 ? (
              <>
                At or below the {activePrediction.referenceTemperatureC.toFixed(1)}°C
                reference — no heat-attributable excess
              </>
            ) : activePrediction.percent === 0 ? (
              <>
                <strong>The same</strong> as the modelled odds at the{" "}
                {activePrediction.referenceTemperatureC?.toFixed(1)}°C reference
              </>
            ) : (
              <>
                <strong
                  className={
                    activePrediction.percent < 0
                      ? styles.statValueDown
                      : styles.statValueUp
                  }
                >
                  {Math.abs(activePrediction.percent).toFixed(1)}%{" "}
                  {activePrediction.percent < 0 ? "lower" : "higher"}
                </strong>{" "}
                than the modelled odds at the{" "}
                {activePrediction.referenceTemperatureC?.toFixed(1)}°C reference
              </>
            )}
          </p>

          {/* Optional context — only surfaces when AF is a positive integer
              percent that's not already implied by the main line (i.e. OR>1
              above reference). This is the "of every 100 exposed cases here,
              N are attributable to the heat" framing; kept small so the
              headline stays the odds sentence the user asked for. */}
          {activePrediction.afPercent !== null && activePrediction.afPercent >= 1 ? (
            <p className={styles.afHint}>
              {Math.round(activePrediction.afPercent)}% of {outcomeLabel.toLowerCase()}{" "}
              cases at this temperature are attributable to the heat exposure
            </p>
          ) : null}
        </>
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
