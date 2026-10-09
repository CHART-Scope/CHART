"use client";

import { useEffect, useMemo, useState } from "react";

import { type IconName } from "@/components/Icon";
import { IconArray } from "@/components/IconArray";
import { PrecisionBadge } from "@/components/PrecisionBadge";
import { PrecisionInfoModal } from "@/components/PrecisionInfoModal";
import { Select } from "@/components/Select";
import {
  fetchHeatOutlook,
  fetchHeatOutlookMap,
  OutlookNotPublished,
  type HeatOutlook,
  type OutlookPart,
} from "@/lib/heatOutlookClient";

import base from "./HeatLbwLinkPanel.module.css";
import styles from "./HeatOutlookPanel.module.css";
import { SpatialRiskMap } from "./SpatialRiskMap";

const MONTHS = [
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
const SIDE_LABEL = { heat: "Heat", cool: "Cooler than usual" } as const;
const RATIO_LABEL = { odds_ratio: "Odds ratio", risk_ratio: "Risk ratio" } as const;

type Selection = { scenario?: string; period?: string; selector?: string };

type Props = {
  /** The place the figures describe: a county, or Kenya itself. */
  geographyId: string;
  /** The place the map frames (the dashboard's page geography). */
  mapGeographyId: string;
  accessToken: string;
  outcome: string;
  outcomeLabel: string;
  figure?: IconName;
  onSelectArea?: (geographyId: string) => void;
};

/**
 * Kenya's climate-attributable risk, read from the modelling team's
 * pre-computed tables: the annual-average share for one period and scenario,
 * as an icon array, a ratio with its 95% CI and a precision badge, beside a
 * county map of the same figure. Every number and every suppression comes
 * from the API; this component only lays them out.
 */
export function HeatOutlookPanel({
  geographyId,
  mapGeographyId,
  accessToken,
  outcome,
  outcomeLabel,
  figure = "newborn",
  onSelectArea,
}: Props) {
  // Choices are kept per outcome: a different outcome has different windows
  // and periods, while a different county keeps them so counties compare.
  const [picked, setPicked] = useState<Selection & { outcome: string }>({ outcome });
  const selection: Selection = picked.outcome === outcome ? picked : {};
  const choose = (next: Selection) =>
    setPicked((current) => ({
      ...(current.outcome === outcome ? current : {}),
      ...next,
      outcome,
    }));
  const [outlook, setOutlook] = useState<HeatOutlook | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
    "loading",
  );
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const { scenario, period, selector } = selection;

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetchHeatOutlook(
      geographyId,
      accessToken,
      { outcome, scenario, period, selector },
      controller.signal,
    )
      .then((next) => {
        setOutlook(next);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setOutlook(null);
        setState(error instanceof OutlookNotPublished ? "missing" : "error");
      });
    return () => controller.abort();
  }, [geographyId, accessToken, outcome, scenario, period, selector]);

  // The map shows the selection the API resolved for this outcome, so it
  // matches the figures. It stays on screen when a county has no published
  // file (the reader leaves it from the map), falling back to the reader's
  // own choices - and the API's defaults - until a resolved one exists.
  const resolvedHere = outlook?.outcome === outcome ? outlook : null;
  const mapSelection = {
    outcome,
    scenario: resolvedHere?.scenario ?? scenario,
    period: resolvedHere?.period ?? period,
    selector: resolvedHere?.selector ?? selector,
  };
  const mapKey = `outlook:${outcome}:${mapSelection.scenario}:${mapSelection.period}:${mapSelection.selector}`;
  const mapSource = useMemo(
    () => ({
      key: mapKey,
      load: (token: string) => fetchHeatOutlookMap(mapGeographyId, token, mapSelection),
    }),
    // mapKey carries every field of mapSelection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapGeographyId, mapKey],
  );

  const current = outlook?.period_summary.find((row) => row.period === outlook.period);
  const heat = current?.parts.find((part) => part.side === "heat") ?? null;
  const baseline = outlook?.period_summary.find((row) => row.is_baseline);
  const scenarioLabel = outlook?.scenarios.find(
    (option) => option.code === outlook.scenario,
  )?.label;
  const periodLabel = outlook?.periods.find(
    (option) => option.code === outlook.period,
  )?.label;
  const shownPercent = heat?.value_percent ?? null;

  return (
    <section
      className={base.panel}
      aria-labelledby="heat-outlook-title"
      aria-busy={state === "loading"}
    >
      <p className={base.eyebrow}>Climate attributable health risk</p>
      <h2 id="heat-outlook-title" className={base.question}>
        What share of{" "}
        <strong className={base.inlineStatic}>{outcomeLabel.toLowerCase()}</strong>{" "}
        cases in{" "}
        <strong className={base.inlineStatic}>{outlook?.place ?? "this place"}</strong>{" "}
        may be attributable to heat in an average year?
      </h2>

      {state === "missing" && (
        <p className={styles.note} role="status">
          No outlook has been published for this place and outcome yet.
        </p>
      )}
      {state === "error" && (
        <p className={styles.note} role="alert">
          The heat outlook could not load.
        </p>
      )}

      {outlook && (
        <>
          <div className={styles.controls}>
            <Select
              label={outcome === "lbw" ? "Pregnancy window" : "Age group"}
              value={outlook.selector}
              options={outlook.selectors.map((option) => ({
                value: option.code,
                label: option.label,
              }))}
              onChange={(selector) => choose({ selector })}
            />
            <Select
              label="Scenario"
              value={outlook.scenario}
              options={outlook.scenarios.map((option) => ({
                value: option.code,
                label: option.label,
              }))}
              onChange={(scenario) => choose({ scenario })}
            />
            <Select
              label="Period"
              value={outlook.period}
              options={outlook.periods.map((option) => ({
                value: option.code,
                label:
                  option.code === outlook.periods[0].code
                    ? `${option.label} (baseline)`
                    : option.label,
              }))}
              onChange={(period) => choose({ period })}
            />
          </div>

          <p className={styles.baseline} data-testid="outlook-baseline">
            Annual average for <strong>{periodLabel}</strong> under {scenarioLabel} ·
            baseline <strong>{outlook.baseline_period}</strong>
          </p>
          {outlook.selector_note && (
            <p className={styles.warning} role="note">
              {outlook.selector_note}
            </p>
          )}
        </>
      )}

      <div className={base.riskLayout}>
        <div className={base.estimate}>
          {shownPercent !== null && shownPercent > 0 ? (
            <div className={base.iconArrayWrap}>
              <IconArray
                value={Math.max(1, Math.round(shownPercent))}
                figure={figure}
              />
            </div>
          ) : (
            <div className={base.emptyGrid} aria-hidden="true" />
          )}

          {outlook && (
            <div className={base.summary} data-testid="outlook-estimate">
              <p className={base.eyebrow}>{outlook.place}</p>
              {heat && shownPercent !== null ? (
                <p className={base.stat}>
                  <strong>{shownPercent.toFixed(1)}%</strong> of{" "}
                  {outcomeLabel.toLowerCase()} cases in {outlook.place} may be
                  attributed to heat in an average year of {periodLabel}
                  {heat.low_percent !== null && heat.high_percent !== null
                    ? ` (95% CI ${heat.low_percent.toFixed(1)} to ${heat.high_percent.toFixed(1)}%)`
                    : ""}
                  .
                </p>
              ) : (
                <p className={base.stat}>
                  {heat?.message ??
                    outlook.selector_note ??
                    "No annual summary is reported for this choice."}
                </p>
              )}
              {heat && heat.change_pp !== null && shownPercent !== null && (
                <p className={styles.change}>
                  {signed(heat.change_pp)} points compared with {baseline?.label} (95%
                  CI {signed(heat.change_low_pp)} to {signed(heat.change_high_pp)})
                </p>
              )}
              {heat?.ratio && (
                <p className={styles.change} data-testid="outlook-ratio">
                  {RATIO_LABEL[heat.ratio.kind]} {heat.ratio.value.toFixed(2)} (95% CI{" "}
                  {heat.ratio.low.toFixed(2)}–{heat.ratio.high.toFixed(2)})
                </p>
              )}
              {heat?.ratio && (
                <div className={base.precisionRow}>
                  <span className={base.precisionLabel}>Precision:</span>
                  <PrecisionBadge
                    level={heat.ratio.precision}
                    onClick={() => setPrecisionOpen(true)}
                  />
                </div>
              )}
              {heat?.thin_data && heat.message && shownPercent !== null && (
                <p className={base.modelScopeNote} role="note">
                  {heat.message}
                </p>
              )}
            </div>
          )}
        </div>

        <div className={base.mapColumn}>
          <SpatialRiskMap
            embedded
            geographyId={mapGeographyId}
            accessToken={accessToken}
            outcome={outcome}
            selectedGeographyId={geographyId}
            onSelect={onSelectArea}
            source={mapSource}
          />
        </div>
      </div>

      {outlook && (
        <details className={base.details}>
          <summary>Seasonal pattern and all periods</summary>
          <p className={styles.note}>{outlook.reference_note}</p>
          {outlook.months.length > 0 && <TypicalMonths outlook={outlook} />}
          <PeriodSummary outlook={outlook} />
          <p className={styles.source}>
            Model tables {outlook.release} from the modelling team, read as published;
            no model is run on request. Source: <code>{outlook.source_uri}</code>
          </p>
        </details>
      )}

      <PrecisionInfoModal
        open={precisionOpen}
        onClose={() => setPrecisionOpen(false)}
        activeLevel={heat?.ratio?.precision}
      />
    </section>
  );
}

function TypicalMonths({ outlook }: { outlook: HeatOutlook }) {
  const sides = outlook.months[0].parts.map((part) => part.side);
  const showOddsRatio = outlook.months.some((month) => month.odds_ratio);
  return (
    <div className={styles.block}>
      <h3 className={styles.subtitle}>Seasonal pattern (typical month)</h3>
      <table className={styles.table} aria-label="Typical month">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Mean daily max</th>
            {sides.map((side) => (
              <th key={side} scope="col">
                {SIDE_LABEL[side]} share (model range)
              </th>
            ))}
            {showOddsRatio && <th scope="col">Odds ratio (95% CI)</th>}
          </tr>
        </thead>
        <tbody>
          {outlook.months.map((month) => (
            <tr key={month.month}>
              <th scope="row">{MONTHS[month.month - 1]}</th>
              <td>{month.tmax_c === null ? "–" : `${month.tmax_c.toFixed(1)} °C`}</td>
              {month.parts.map((part) => (
                <td key={part.side}>{formatShare(part)}</td>
              ))}
              {showOddsRatio && (
                <td>
                  {month.odds_ratio
                    ? `${month.odds_ratio.value.toFixed(2)} (${month.odds_ratio.low.toFixed(2)}–${month.odds_ratio.high.toFixed(2)}) at ${month.odds_ratio.at_tmax_c.toFixed(1)} °C`
                    : "–"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <Messages parts={outlook.months.flatMap((month) => month.parts)} />
    </div>
  );
}

function PeriodSummary({ outlook }: { outlook: HeatOutlook }) {
  if (outlook.period_summary.length === 0) {
    return (
      <p className={styles.note}>
        No period summary is reported for this{" "}
        {outlook.outcome === "lbw" ? "window" : "age group"}.
      </p>
    );
  }
  const multipleSides = outlook.period_summary[0].parts.length > 1;
  return (
    <div className={styles.block}>
      <h3 className={styles.subtitle}>
        By period, {outlook.scenarios.find((s) => s.code === outlook.scenario)?.label}
      </h3>
      <table className={styles.table} aria-label="By period">
        <thead>
          <tr>
            <th scope="col">Period</th>
            {multipleSides && <th scope="col">Side</th>}
            <th scope="col">Share (95% CI)</th>
            <th scope="col">Ratio (95% CI)</th>
            <th scope="col">Climate-model range</th>
            <th scope="col">Change vs baseline</th>
          </tr>
        </thead>
        <tbody>
          {outlook.period_summary.flatMap((row) =>
            row.parts.map((part) => (
              <tr
                key={`${row.period}-${part.side}`}
                aria-current={row.period === outlook.period || undefined}
              >
                <th scope="row">
                  {row.label}
                  {row.is_baseline ? " (baseline)" : ""}
                </th>
                {multipleSides && <td>{SIDE_LABEL[part.side]}</td>}
                <td>
                  {formatShare(part)}
                  {part.thin_data && <span className={styles.flag}> thin data</span>}
                </td>
                <td>
                  {part.ratio
                    ? `${part.ratio.value.toFixed(2)} (${part.ratio.low.toFixed(2)}–${part.ratio.high.toFixed(2)})`
                    : "–"}
                </td>
                <td>
                  {part.value_percent === null || part.gcm_min_percent === null
                    ? "–"
                    : `${part.gcm_min_percent.toFixed(1)}–${part.gcm_max_percent?.toFixed(1)}%`}
                </td>
                <td>
                  {part.value_percent === null || part.change_pp === null
                    ? "–"
                    : `${signed(part.change_pp)} pts (${signed(part.change_low_pp)} to ${signed(part.change_high_pp)})`}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <Messages parts={outlook.period_summary.flatMap((row) => row.parts)} />
    </div>
  );
}

function Messages({ parts }: { parts: OutlookPart[] }) {
  const messages = [...new Set(parts.map((part) => part.message).filter(Boolean))];
  return messages.map((message) => (
    <p key={message} className={styles.note} role="note">
      {message}
    </p>
  ));
}

function formatShare(part: OutlookPart): string {
  if (part.value_percent === null) return "Not shown";
  const range =
    part.low_percent === null || part.high_percent === null
      ? ""
      : ` (${part.low_percent.toFixed(1)} to ${part.high_percent.toFixed(1)})`;
  return `${part.value_percent.toFixed(1)}%${range}`;
}

function signed(value: number | null): string {
  if (value === null) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
