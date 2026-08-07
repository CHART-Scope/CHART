"use client";

import { useEffect, useMemo, useState } from "react";

import { AreaTree, type AreaTreeItem } from "@/components/AreaTree";
import { IconArray } from "@/components/IconArray";
import { type PrecisionLevel } from "@/components/PrecisionBadge";
import { Slider } from "@/components/Slider";
import { recordAuditEvent } from "@/lib/audit";
import {
  getPredictionRequest,
  listPredictionRequests,
  type PredictionRequest,
} from "@/lib/planningClient";

import styles from "./HeatLbwLinkPanel.module.css";
import { useWhatIfScore } from "./useWhatIfScore";

type Props = {
  /** Label for the state / whole-area default (e.g. "Madhya Pradesh (State)"). */
  stateLabel: string;
  /** Districts the model covers under this state. */
  districts?: readonly { code: string; name: string }[];
  /** Selected district code, or ``null`` for the whole-state view. */
  activeAdminUnitCode?: string | null;
  onAdminUnitChange?: (code: string | null) => void;
  /** Geography id and token needed to look up the latest run. */
  geographyId?: string;
  accessToken?: string;
  /** Bump this to force a re-fetch when a new run completes. */
  refreshKey?: string | null;
};

const FALLBACK_MIN_TEMP = 30;
const FALLBACK_MAX_TEMP = 45;
const DEFAULT_TEMP = 32;

/** Sentinel id the AreaTree uses for the "whole state" row so we can map it
 * back to the null admin_unit convention this panel exposes upstream. */
const STATE_ROOT_ID = "__state__";

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

type LatestPrediction = {
  attributableFractionPercent: number;
  oddsRatio: number;
  ci95Low: number;
  ci95High: number;
  precision: PrecisionLevel;
  months: readonly { label: string; tempC: number | null }[];
  planningDate: string;
};

export function HeatLbwLinkPanel({
  stateLabel,
  districts = [],
  activeAdminUnitCode = null,
  onAdminUnitChange,
  geographyId,
  accessToken,
  refreshKey,
}: Props) {
  const [temperature, setTemperature] = useState<number>(DEFAULT_TEMP);
  const [latest, setLatest] = useState<LatestPrediction | null>(null);
  // The district picker changes which model block (state vs division) is
  // hit. Route both the what-if score and the "latest completed run" lookup
  // through the same effective id the batch predictor uses in
  // useAutoPrediction, so all three views stay on the same model.
  const effectiveGeographyId = activeAdminUnitCode ?? geographyId;
  const whatIf = useWhatIfScore({
    geographyId: effectiveGeographyId,
    accessToken,
    temperatureC: temperature,
  });

  // The what-if response carries the LBW model's training-support range
  // and its sample size. Track them so the slider stays within the model's
  // validity band and the model readout can show how many pregnancies the
  // fit was based on. Reset when the district changes — a division block
  // has its own boundary knots and its own n_training.
  const [modelRange, setModelRange] = useState<[number, number] | null>(null);
  const [nTraining, setNTraining] = useState<number | null>(null);
  useEffect(() => {
    setModelRange(null);
    setNTraining(null);
  }, [effectiveGeographyId]);
  useEffect(() => {
    const range = whatIf.score?.modelled_temperature_range_c;
    if (range && range.length === 2) setModelRange([range[0], range[1]]);
    if (typeof whatIf.score?.n_training === "number") {
      setNTraining(whatIf.score.n_training);
    }
  }, [whatIf.score]);

  const sliderMin = modelRange?.[0] ?? FALLBACK_MIN_TEMP;
  const sliderMax = modelRange?.[1] ?? FALLBACK_MAX_TEMP;
  useEffect(() => {
    setTemperature((prev) => Math.min(sliderMax, Math.max(sliderMin, prev)));
  }, [sliderMin, sliderMax]);

  useEffect(() => {
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
        // Latest prediction is a courtesy display; failure keeps the
        // slider explorer usable, so we swallow errors silently.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, effectiveGeographyId, refreshKey]);

  // The slider drives the IconArray so shaded/unshaded reflects the model's
  // current what-if. Fall back to the batch prediction. When neither has
  // returned yet we render a skeleton — no fake number.
  const activePrediction: {
    percent: number;
    oddsRatio: number | null;
    ci95Low: number | null;
    ci95High: number | null;
    source: "what-if" | "batch";
  } | null = whatIf.score
    ? {
        percent: whatIf.score.attributable_fraction_percent,
        oddsRatio: whatIf.score.odds_ratio,
        ci95Low: whatIf.score.ci95_low,
        ci95High: whatIf.score.ci95_high,
        source: "what-if",
      }
    : latest
      ? {
          percent: latest.attributableFractionPercent,
          oddsRatio: latest.oddsRatio,
          ci95Low: latest.ci95Low,
          ci95High: latest.ci95High,
          source: "batch",
        }
      : null;
  const showingRealResult = activePrediction !== null;

  const monthPills = useMemo(() => latest?.months ?? [], [latest]);

  const treeItems = useMemo<AreaTreeItem[]>(
    () => [
      {
        id: STATE_ROOT_ID,
        // stateLabel arrives as "Madhya Pradesh (State)"; strip the
        // parenthetical so the tree renders the level label once on the
        // right instead of duplicating it inline.
        name: stateLabel.replace(/\s*\([^)]*\)\s*$/, ""),
        levelLabel: "State",
        parentId: null,
      },
      ...districts.map((district) => ({
        id: district.code,
        name: district.name,
        levelLabel: "District",
        parentId: STATE_ROOT_ID,
      })),
    ],
    [stateLabel, districts],
  );

  return (
    <section className={styles.panel} aria-labelledby="heat-lbw-heading">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Link between heat and low-birth-weight</p>
        <div className={styles.viewingFor}>
          <span className={styles.viewingLabel}>Viewing for</span>
          <AreaTree
            items={treeItems}
            selectedId={activeAdminUnitCode ?? STATE_ROOT_ID}
            onSelect={(id) => {
              const next = id === STATE_ROOT_ID ? null : id;
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
          />
        </div>
      </header>
      <h2 id="heat-lbw-heading" className={styles.visuallyHidden}>
        Attributable fraction and precision
      </h2>

      {showingRealResult ? (
        <>
          <div className={styles.iconArrayWrap}>
            <IconArray value={activePrediction.percent} figure="newborn" />
          </div>

          <p className={styles.stat}>
            <strong>{Math.round(activePrediction.percent)}%</strong> of all low birth
            weight cases may be attributable to maternal heat exposure
          </p>

          {monthPills.length > 0 ? (
            <ul
              className={styles.tempPills}
              aria-label="Temperatures used in the prediction"
            >
              {monthPills.map((month) => (
                <li key={month.label} className={styles.tempPill}>
                  <strong>{month.label}</strong>
                  <span>
                    {month.tempC !== null ? `${month.tempC.toFixed(1)}°C` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {activePrediction.oddsRatio !== null ? (
            <p className={styles.modelReadout}>
              Odds ratio <strong>{activePrediction.oddsRatio.toFixed(2)}</strong> · 95%
              CI{" "}
              <strong>
                {activePrediction.ci95Low!.toFixed(2)}–
                {activePrediction.ci95High!.toFixed(2)}
              </strong>
            </p>
          ) : null}
        </>
      ) : (
        <div
          className={styles.skeleton}
          role="status"
          aria-live="polite"
          aria-label="Preparing prediction"
        >
          <div className={styles.skeletonGrid} />
          <div className={styles.skeletonLine} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
        </div>
      )}

      {/* <div className={styles.precisionRow}>
        <span className={styles.precisionLabel}>Precision:</span>
        <PrecisionBadge level={displayPrecision} />
      </div> */}

      <div className={styles.explorerHeader}>
        <p className={styles.explorerLabel}>Explore what-if</p>
        <p className={styles.tempReadout} data-loading={whatIf.loading}>
          {formatWhatIfReadout(whatIf, temperature)}
          {isEstimateReadout(whatIf) ? (
            <span
              className={styles.estimateTag}
              title="Estimated from a local fallback curve, not the LBW model."
            >
              est.
            </span>
          ) : null}
        </p>
      </div>

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
          <span>{sliderMin.toFixed(0)}°C</span>
          <span>{sliderMax.toFixed(0)}°C</span>
        </div>
        {modelRange ? (
          <p className={styles.sliderNote}>
            Range set by the model's training support
            {nTraining !== null
              ? ` · n = ${nTraining.toLocaleString()} pregnancies`
              : ""}
          </p>
        ) : null}
      </div>

      <p className={styles.footnote}>
        {showingRealResult
          ? "The icons and pills reflect the latest completed prediction. Drag the slider to explore hypothetical temperatures."
          : "Drag the slider to see how hotter temperatures during pregnancy can increase the likelihood of low birth weight. Once a prediction completes for this area, the icons will switch to the model's own attribution."}
      </p>
    </section>
  );
}

function toLatestPrediction(run: PredictionRequest): LatestPrediction | null {
  const prediction = run.result?.prediction;
  if (!prediction) return null;
  const or_ = prediction.odds_ratio;
  const rawAf = or_ > 1 ? (or_ - 1) / or_ : 0;
  const attributableFractionPercent = Math.round(rawAf * 1000) / 10;
  const climate = run.result?.climate ?? run.climate;
  const months = [...climate]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((month) => ({
      label: monthLabel(month.month),
      tempC: month.temperature_c,
    }));
  return {
    attributableFractionPercent,
    oddsRatio: prediction.odds_ratio,
    ci95Low: prediction.ci95_low,
    ci95High: prediction.ci95_high,
    precision: precisionFromInterval(prediction.ci95_low, prediction.ci95_high),
    months,
    planningDate: run.planning_date,
  };
}

function monthLabel(iso: string): string {
  if (iso.length < 7) return iso;
  const monthIndex = Number.parseInt(iso.slice(5, 7), 10) - 1;
  return MONTH_LABELS[monthIndex] ?? iso.slice(5, 7);
}

function precisionFromInterval(low: number, high: number): PrecisionLevel {
  const spread = Math.max(high - low, 0);
  if (spread <= 0.1) return "high";
  if (spread <= 0.3) return "moderate";
  return "low";
}

// Pre-auth / error fallback so the slider stays meaningful when the model
// call cannot run. The real % comes from useWhatIfScore -> /climate/what-if.
function attributableFractionAt(temperatureC: number): number {
  const clamped = Math.max(
    FALLBACK_MIN_TEMP,
    Math.min(FALLBACK_MAX_TEMP, temperatureC),
  );
  const above30 = clamped - 30;
  const percent = 5 + above30 * 3;
  return Math.max(0, Math.min(100, percent));
}

function formatWhatIfReadout(
  state: ReturnType<typeof useWhatIfScore>,
  temperature: number,
): string {
  if (state.score) return `${state.score.attributable_fraction_percent.toFixed(1)}%`;
  if (state.loading) return "…";
  return `~${Math.round(attributableFractionAt(temperature))}%`;
}

function isEstimateReadout(state: ReturnType<typeof useWhatIfScore>): boolean {
  return !state.score && !state.loading;
}
