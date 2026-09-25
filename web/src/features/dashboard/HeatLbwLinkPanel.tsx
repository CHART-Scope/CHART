"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { type IconName } from "@/components/Icon";
import { IconArray } from "@/components/IconArray";
import { PrecisionBadge } from "@/components/PrecisionBadge";
import { PrecisionInfoModal } from "@/components/PrecisionInfoModal";
import { precisionFromCi, type PrecisionLevel } from "@/lib/precision";

import styles from "./HeatLbwLinkPanel.module.css";
import { affectedPercentFromOddsRatio, relativeOddsChangePercent } from "./oddsRatio";
import { DemoProvenanceCard } from "./DemoProvenanceCard"; // DEMO-ONLY
import { MonthYearPicker } from "./MonthYearPicker";
import { PreparationProgress } from "./PreparationProgress";
import { useMonthlyRisk } from "./useMonthlyRisk";

type Props = {
  /** Label for the currently-viewed place (e.g. "Bhopal Division",
   * "Madhya Pradesh (State)"). Rendered as static text in the question
   * header — the actual switching lives in DashboardContextBar. */
  placeLabel: string;
  outcomeControl?: ReactNode;
  placeControl?: ReactNode;
  children?: ReactNode;
  onPredictionReady?: () => void;
  modelAreaName?: string | null;
  outcome?: string;
  outcomeLabel?: string;
  /** Figure rendered in each cell; defaults to the newborn silhouette. */
  figure?: IconName;
  batchEnabled?: boolean;
  /** Whether this user may queue a prediction for a month that has none. */
  canPrepare?: boolean;
  geographyId?: string;
  /** Selected month as `YYYY-MM`. When supplied the month is controlled by the
   * caller (the dashboard keeps it in the URL so it survives a reload); when
   * omitted the panel keeps its own, which is what Storybook uses. */
  month?: string | null;
  onMonthChange?: (month: string) => void;
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

export function HeatLbwLinkPanel({
  placeLabel,
  outcomeControl,
  placeControl,
  children,
  onPredictionReady,
  modelAreaName = null,
  outcome = "lbw",
  outcomeLabel = "low birth weight",
  figure = "newborn",
  batchEnabled = true,
  canPrepare = false,
  geographyId,
  month: monthProp,
  onMonthChange,
  accessToken,
  previewPrediction,
}: Props) {
  const [internalMonth, setInternalMonth] = useState<string>("");
  const selectableMonths = useMemo(
    () => monthsBackFrom(lastCompleteMonth(), SELECTABLE_MONTHS_BACK),
    [],
  );
  // Falls back to the newest complete month rather than "". An empty month
  // was still handed to the prepare path, which submitted a planning_date of
  // "-01" and was rejected as an invalid date.
  const requested = monthProp || internalMonth || selectableMonths.at(-1) || "";
  // One month drives the fetch and the sentence alike. A shared link can carry
  // a month outside the selectable window; resolving that separately for the
  // hook and for the card meant queueing a prediction for one month while
  // displaying another, with no sign that the two had parted.
  const selectedMonth = selectableMonths.includes(requested)
    ? requested
    : (selectableMonths.at(-1) ?? "");
  const setMonth = onMonthChange ?? setInternalMonth;
  const [precisionModalOpen, setPrecisionModalOpen] = useState(false);

  // The dashboard now owns place selection (see DashboardContextBar) and
  // navigates whenever the user picks a different area, so the panel
  // just uses the geographyId it was handed.
  // Choosing a month is choosing a temperature: the month's observed ERA5
  // mean daily maximum is what the model scores. A month that already has a
  // stored prediction shows instantly; one that does not is queued, run and
  // stored, so coming back to it is instant too.
  const monthly = useMonthlyRisk({
    geographyId: geographyId ?? "",
    accessToken: accessToken ?? "",
    month: selectedMonth,
    canPrepare: canPrepare && Boolean(geographyId && accessToken),
    outcome,
  });
  // Which months already hold observations, so the picker can mark them.
  // Every month a planner may ask about stays selectable, not only these:
  // picking one CHART has no data for is a valid request, because the prepare
  // path queues it, the pipeline fetches the observations and scores them,
  // and the month fills in.
  const observedMonths = Object.keys(monthly.data?.months ?? {})
    .filter((key) => monthly.data?.months[key]?.temperature)
    .sort();
  const entry = monthly.data?.months[selectedMonth];
  const hasPrediction = Boolean(entry?.prediction);
  useEffect(() => {
    if (hasPrediction) onPredictionReady?.();
  }, [geographyId, outcome, selectedMonth, hasPrediction, onPredictionReady]);
  const temperature = entry?.temperature?.tmax_monthly_mean_c ?? null;
  const monthPrediction = entry?.prediction ?? null;

  // Attributable percentage per month so the grid shows where the risk sits
  // before anything is clicked.
  const intensityByMonth = Object.fromEntries(
    Object.entries(monthly.data?.months ?? {}).flatMap(([key, value]) =>
      value.prediction
        ? [[key, value.prediction.attributable_fraction_milli / 10]]
        : [],
    ),
  );

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
  } | null = monthPrediction
    ? {
        percent: relativeOddsChangePercent(monthPrediction.odds_ratio, {
          temperatureC: temperature,
          referenceTemperatureC: monthPrediction.reference_temperature_c,
          attributableFraction: monthPrediction.attributable_fraction_policy,
        }),
        // The stored fraction is authoritative; it is what was persisted
        // alongside this odds ratio rather than re-derived here.
        afPercent: monthPrediction.attributable_fraction_milli / 10,
        oddsRatio: monthPrediction.odds_ratio,
        referenceTemperatureC: asFiniteNumber(monthPrediction.reference_temperature_c),
        ci95Low: monthPrediction.ci95_low,
        ci95High: monthPrediction.ci95_high,
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
  // Whether a result is genuinely still on its way. A blocked release, or a
  // user who cannot queue a run, will never produce one - rendering the
  // loading skeleton in that case shows a shimmering placeholder forever
  // directly above a sentence explaining that nothing is coming.
  const awaitingResult =
    !showingRealResult &&
    Boolean(accessToken) &&
    batchEnabled &&
    (monthly.phase === "loading" || monthly.phase === "preparing");

  // Null when the release ships no reference, or when an older API omits
  // the field; the clause is then simply dropped from the sentence.
  const reference = activePrediction
    ? referenceClause(
        activePrediction.referenceTemperatureC,
        monthPrediction?.reference_kind ?? null,
      )
    : null;

  const attributedPercent = Math.round(activePrediction?.afPercent ?? 0);
  const hasAttributableCases = (activePrediction?.afPercent ?? 0) > 0;

  // Why a month attributes nothing. Without this the card stated "no
  // attributable cases" directly above a provenance row reading "Odds ratio
  // 1.332", which reads as a contradiction: an odds ratio above 1 plainly
  // means elevated risk. Both statements are true - the elevated odds sit on
  // the cool side of the fitted curve, and a heat measure does not attribute
  // excess below its own reference - but the card has to say so.
  const referenceC = asFiniteNumber(activePrediction?.referenceTemperatureC);
  const oddsRatio = asFiniteNumber(activePrediction?.oddsRatio);
  const zeroReason =
    hasAttributableCases || !showingRealResult
      ? null
      : temperature !== null && referenceC !== null && temperature < referenceC
        ? oddsRatio !== null && oddsRatio > 1
          ? `: this month is cooler than the ${referenceC.toFixed(1)}°C reference, so its raised odds ratio of ${oddsRatio.toFixed(2)} sits on the cool side of the curve and is not attributed to heat`
          : `: this month is cooler than the ${referenceC.toFixed(1)}°C reference`
        : oddsRatio !== null && oddsRatio <= 1
          ? temperature !== null &&
            referenceC !== null &&
            temperature > referenceC &&
            oddsRatio < 1
            ? /* A hot month scoring at or below 1 is not the model saying heat
                 is harmless here. It is this block's fitted curve turning
                 downward above its own reference, which is a property of the
                 fit rather than a finding about the month, and several blocks
                 do it well inside their training range. Saying "no excess
                 risk" would report that artefact as reassurance. */
              `: the fitted curve for this area turns downward above its ${referenceC.toFixed(1)}°C reference, so it attributes no excess at ${temperature.toFixed(1)}°C (odds ratio ${oddsRatio.toFixed(2)}) — the model cannot support a heat estimate for this month`
            : `: at this temperature the model estimates no excess risk (odds ratio ${oddsRatio.toFixed(2)})`
          : null;

  // Whether the stored result was extrapolated past what the block was fitted
  // on. It is recorded on every prediction and was never shown, so a month
  // scored outside the training range read exactly like one inside it.
  const offTrainingSupport = monthPrediction?.on_training_support === false;
  const fittedSampleSize = monthPrediction?.n_training ?? null;

  const precisionLevel: PrecisionLevel | null =
    activePrediction &&
    activePrediction.ci95Low !== null &&
    activePrediction.ci95High !== null
      ? precisionFromCi(activePrediction.ci95Low, activePrediction.ci95High)
      : null;

  return (
    <section className={styles.panel} aria-labelledby="heat-lbw-heading">
      <p className={styles.eyebrow}>Climate attributable health risk</p>

      <h2 id="heat-lbw-heading" className={styles.question}>
        What share of{" "}
        <span className={styles.phrase}>
          <span className={styles.inlineStatic}>
            {outcomeControl ?? outcomeLabel.toLowerCase()}
          </span>
        </span>{" "}
        cases in{" "}
        <span className={styles.phrase}>
          <span className={styles.inlineStatic}>{placeControl ?? placeLabel}</span>
        </span>{" "}
        may be attributable to heat exposure?
      </h2>

      {modelAreaName ? (
        <p className={styles.modelScopeNote}>
          Health response calculated with the <strong>{modelAreaName}</strong> fitted
          model area.
        </p>
      ) : null}

      <div className={styles.pickerWrap}>
        <p className={styles.pickerHint}>Choose a month to explore</p>
        <MonthYearPicker
          available={selectableMonths}
          observed={observedMonths}
          intensity={intensityByMonth}
          value={selectedMonth}
          onChange={setMonth}
        />
      </div>

      <div className={children ? styles.riskLayout : undefined}>
        <div className={styles.estimate}>
          {showingRealResult ? (
            attributedPercent > 0 ? (
              <div className={styles.iconArrayWrap}>
                <IconArray value={attributedPercent} figure={figure} />
              </div>
            ) : null
          ) : awaitingResult ? (
            <div className={styles.preparing}>
              <div
                className={styles.skeletonGrid}
                role="status"
                aria-live="polite"
                aria-label={
                  monthly.phase === "preparing"
                    ? "Waiting for a prediction result"
                    : "Loading prediction"
                }
                data-pending={monthly.phase === "preparing" || undefined}
              >
                {monthly.phase === "preparing" ? "No estimate yet" : null}
              </div>
              {/* Which half of the pipeline is running. Fetching observations and
              scoring them take very different amounts of time, and the
              skeleton alone cannot tell a slow download from a stall. */}
              {monthly.phase === "preparing" && (
                <PreparationProgress stage={monthly.stage} />
              )}
            </div>
          ) : (
            <div className={styles.emptyGrid} aria-hidden="true" />
          )}

          <div className={styles.summary}>
            <p className={styles.eyebrow}>{placeLabel}</p>
            {showingRealResult ? (
              <>
                {/* One sentence carrying month, exposure, attributed share, place and
              the reference clause.

              "Maximum temperature", not "average maximum temperature": the
              variable is maximum temperature, and saying "average maximum"
              reads as a contradiction even though the monthly value is a mean
              of daily maxima. Agreed on the 17 Sep modelling call.

              "May be attributed" is deliberate: it states what the model
              attributes from the observed sample rather than asserting what
              heat caused, which is the defensible claim given how wide these
              confidence intervals are. */}
                <p className={styles.stat}>
                  {temperature !== null ? (
                    <>
                      At a maximum temperature of {temperature.toFixed(1)}°C in{" "}
                      {formatMonthName(selectedMonth)},{" "}
                    </>
                  ) : (
                    <>In {formatMonthName(selectedMonth)}, </>
                  )}
                  {hasAttributableCases ? (
                    <>
                      <strong>{attributedPercent || "<1"}%</strong> of{" "}
                      {outcomeLabel.toLowerCase()} cases in {placeLabel} may be
                      attributed to heat exposure
                    </>
                  ) : (
                    /* Never render a bare "0%". It reads as "heat is safe here", and it
                 co-occurs with a Low precision badge, so it would assert a
                 confident nothing where the model is least certain. */
                    <>
                      <strong>no attributable cases</strong> of{" "}
                      {outcomeLabel.toLowerCase()} in {placeLabel}
                    </>
                  )}
                  {zeroReason ?? (reference ? <>, {reference}</> : null)}.
                </p>
                {offTrainingSupport ? (
                  <p className={styles.modelScopeNote} role="note">
                    This month sits outside the temperatures this area&rsquo;s model was
                    fitted on, so the figure above is extrapolated rather than
                    estimated. Treat it as an indication only.
                  </p>
                ) : null}
              </>
            ) : (
              <p className={styles.stat} data-loading role="status">
                {monthly.phase === "preparing"
                  ? monthly.stage === "queued"
                    ? "Your request is saved and waiting to begin. This page will update automatically as it progresses."
                    : monthly.stage === "waiting_for_data"
                      ? "The source data is not available yet. This page checks the request automatically."
                      : "Preparing this month’s estimate. It will appear here when the saved result is available."
                  : monthly.phase === "failed"
                    ? (monthly.error ?? "This month could not be prepared.")
                    : /* A month with no stored result normally queues a run on
                   selection. When it cannot, saying "Preparing prediction…"
                   promises a result that will never arrive, so name the
                   reason instead. */
                      !batchEnabled
                      ? `${outcomeLabel[0].toUpperCase()}${outcomeLabel.slice(1)} is not yet cleared for scoring — this release is waiting on confirmation from the modelling team.`
                      : monthly.phase === "loading" && accessToken
                        ? "Loading the selected month…"
                        : !canPrepare
                          ? "No result has been prepared for this month. A planning lead can prepare it."
                          : "Preparing prediction…"}
              </p>
            )}

            {monthly.phase === "failed" && !showingRealResult ? (
              <button type="button" className={styles.retry} onClick={monthly.retry}>
                Check again
              </button>
            ) : null}
            {monthly.phase === "preparing" && monthly.requestId ? (
              <p className={styles.requestStatus}>
                Request #{monthly.requestId}
                {monthly.lastChecked
                  ? ` · Last checked ${new Date(monthly.lastChecked).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : " · Checking status…"}
              </p>
            ) : null}
            {precisionLevel ? (
              <div className={styles.precisionRow}>
                <span className={styles.precisionLabel}>Precision:</span>
                <PrecisionBadge
                  level={precisionLevel}
                  onClick={() => setPrecisionModalOpen(true)}
                />
              </div>
            ) : null}
          </div>
        </div>
        {children ? (
          <div className={styles.mapColumn}>
            {fittedSampleSize ? (
              <p className={styles.sampleSize} aria-label="Fitted model sample size">
                <span>Fitted sample</span>
                <strong>{fittedSampleSize.toLocaleString()}</strong>
                <span>observations</span>
              </p>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>

      <details className={styles.details}>
        <summary>Data and model details</summary>
        <DemoProvenanceCard
          month={selectedMonth}
          entry={entry ?? null}
          areaBbox={monthly.data?.area_bbox ?? null}
        />
      </details>
      {/* DEMO-ONLY */}

      <PrecisionInfoModal
        open={precisionModalOpen}
        onClose={() => setPrecisionModalOpen(false)}
        activeLevel={precisionLevel ?? undefined}
      />
    </section>
  );
}

function formatMonthName(month: string): string {
  if (!month) return "this month";
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** An MMT must be named as one; any other anchor is stated as a plain
 * reference. Falls back to the neutral wording when the release does not
 * declare a kind, so we never call something an MMT on a guess. */
function referenceClause(referenceC: unknown, kind: string | null): string | null {
  const reference = asFiniteNumber(referenceC);
  if (reference === null) return null;
  const value = `${reference.toFixed(1)}°C`;
  return kind === "mmt"
    ? `given the minimum mortality temperature of ${value}`
    : `compared to a reference temperature of ${value}`;
}

/** Narrow an untrusted payload value to a usable number. */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** How far back the month grid lets a planner go. Matches the picker's own
 * default year window so the stepper and the grid agree. */
const SELECTABLE_MONTHS_BACK = 60;

/** The newest month that can have a complete observed record.
 *
 * ERA5 lands a few days in arrears, so the month in progress never has a full
 * set of daily maxima and is not offered. Exported because the spatial map
 * queues against the same month the picker defaults to - if they disagreed,
 * the map would prepare a month the card never shows. */
/** ERA5 monthly fields appear in the first days of the month after the one
 * they cover, so early in a month the month that just ended is not published
 * either. Offering it would queue a pull for data that does not exist yet.
 * Mirrors `ERA5_PUBLICATION_LAG_DAYS` in `chart/climate/routes.py`. */
const ERA5_PUBLICATION_LAG_DAYS = 6;

export function lastCompleteMonth(now = new Date()): string {
  const back = now.getUTCDate() <= ERA5_PUBLICATION_LAG_DAYS ? 2 : 1;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return d.toISOString().slice(0, 7);
}

function monthsBackFrom(newest: string, count: number): string[] {
  const year = Number(newest.slice(0, 4));
  const month = Number(newest.slice(5, 7));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}
