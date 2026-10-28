"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { type IconName } from "@/components/Icon";
import { IconArray } from "@/components/IconArray";
import { PrecisionBadge } from "@/components/PrecisionBadge";
import { PrecisionInfoModal } from "@/components/PrecisionInfoModal";
import { Select } from "@/components/Select";
import { Tabs } from "@/components/Tabs";
import {
  fetchHeatOutlook,
  fetchHeatOutlookMap,
  fetchObservedRisk,
  fetchObservedRiskMap,
  OutlookNotPublished,
  type HeatOutlook,
  type ObservedRisk,
  type OutlookCapabilities,
  type OutlookOption,
  type OutlookPart,
  type OutlookRatio,
  type OutlookReference,
  type OutlookView,
} from "@/lib/heatOutlookClient";

import base from "./HeatLbwLinkPanel.module.css";
import { MonthYearPicker } from "./MonthYearPicker";
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
const SIDE_LABEL = {
  heat: "Heat",
  cool: "Cooler than usual",
  total: "Total temperature effect",
} as const;
const RATIO_LABEL = { odds_ratio: "Odds ratio", risk_ratio: "Risk ratio" } as const;
const VIEW_TABS = [
  { value: "observed", label: "Observed" },
  { value: "projection", label: "Projected" },
] as const;

export type OutlookChoices = {
  view?: OutlookView;
  /** Observed and projected releases can have different selector codes. */
  observedSelector?: string;
  selector?: string;
  month?: string;
  scenario?: string;
  period?: string;
  reference?: OutlookReference;
};

type Choices = OutlookChoices;

type Load<T> = {
  data: T | null;
  state: "loading" | "ready" | "missing" | "error";
};

type Props = {
  /** The place the figures describe at any configured geography level. */
  geographyId: string;
  /** The place the map frames (the dashboard's page geography). */
  mapGeographyId: string;
  accessToken: string;
  outcome: string;
  outcomeLabel: string;
  placeLabel?: string;
  dataModes?: OutlookView[];
  observedCapability?: OutlookCapabilities["observed"];
  projectionRelease?: string | null;
  /** An explicitly assigned live model's existing monthly view. */
  observedContent?: ReactNode;
  selection?: OutlookChoices;
  onSelectionChange?: (selection: OutlookChoices) => void;
  figure?: IconName;
  onSelectArea?: (geographyId: string) => void;
};

/**
 * Published climate-attributable risk in two views. Observed scores a month of
 * ERA5 with the modeller's DLNM on request; Projected reads the modeller's
 * pre-computed typical months for a future period. Both show an icon array,
 * a ratio with its 95% CI and a precision badge beside a county map of the
 * same figure. Every number and every suppression comes from the API.
 */
export function HeatOutlookPanel({
  geographyId,
  mapGeographyId,
  accessToken,
  outcome,
  outcomeLabel,
  placeLabel,
  figure = "newborn",
  dataModes = ["observed", "projection"],
  observedCapability,
  projectionRelease,
  observedContent,
  selection,
  onSelectionChange,
  onSelectArea,
}: Props) {
  // Choices are kept per outcome: a different outcome has different windows
  // and periods, while a different area keeps them for comparison.
  const [picked, setPicked] = useState<Choices & { outcome: string }>({ outcome });
  const choice: Choices = selection ?? (picked.outcome === outcome ? picked : {});
  const choose = (next: Choices) => {
    const merged = { ...choice, ...next };
    setPicked({ ...merged, outcome });
    onSelectionChange?.(merged);
  };
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const { selector, observedSelector, month, scenario, period } = choice;
  const reference = choice.reference ?? "annual";

  const observedEnabled = dataModes.includes("observed");
  const monthlyObserved = observedCapability?.source === "monthly";
  const outlookObserved = observedEnabled && !monthlyObserved;
  const observed = useLoaded<ObservedRisk>(
    (signal) =>
      outlookObserved
        ? fetchObservedRisk(
            geographyId,
            accessToken,
            { outcome, month, selector: observedSelector },
            signal,
          )
        : Promise.reject(new OutlookNotPublished(geographyId)),
    [geographyId, accessToken, outcome, month, observedSelector, outlookObserved],
  );
  const projectionEnabled = dataModes.includes("projection");
  const projected = useLoaded<HeatOutlook>(
    (signal) =>
      projectionEnabled
        ? fetchHeatOutlook(
            geographyId,
            accessToken,
            { outcome, scenario, period, selector },
            signal,
          )
        : Promise.reject(new OutlookNotPublished(geographyId)),
    [geographyId, accessToken, outcome, scenario, period, selector, projectionEnabled],
  );

  // Never carry another place or outcome's figures into this selection.
  const observedData =
    observed.data?.outcome === outcome && observed.data.geography_id === geographyId
      ? observed.data
      : null;
  const projectedData =
    projected.data?.outcome === outcome && projected.data.geography_id === geographyId
      ? projected.data
      : null;

  const observedOpen =
    observedEnabled &&
    (monthlyObserved ||
      observed.state === "loading" ||
      (observed.state === "ready" && observedData !== null));
  const projectedOpen =
    projectionEnabled &&
    (projected.state === "loading" ||
      (projected.state === "ready" && projectedData !== null));
  // Observed is the default once it has a month to show; a place or setting
  // without it opens on the projection instead.
  const view: OutlookView =
    (!observedEnabled ? "projection" : !projectionEnabled ? "observed" : choice.view) ??
    (monthlyObserved || (observedData && observedData.available_months.length > 0)
      ? "observed"
      : observed.state === "loading"
        ? "observed"
        : projectedOpen
          ? "projection"
          : "observed");
  const settled = view === "observed" ? observed : projected;
  const showMonthlyObserved = view === "observed" && monthlyObserved;
  const busy = !showMonthlyObserved && settled.state === "loading";

  const place =
    (view === "observed" ? observedData?.place : projectedData?.place) ??
    placeLabel ??
    "this place";
  const selectors =
    (view === "observed" ? observedData?.selectors : projectedData?.selectors) ?? [];
  const resolvedSelector =
    view === "observed" ? observedData?.selector : projectedData?.selector;

  const shown =
    view === "observed"
      ? observedFigure(observedData)
      : projectedFigure(projectedData, reference);

  const mapSource = useMapSource({
    view,
    outcome,
    mapGeographyId,
    observed: observedData,
    projected: projectedData,
    choice: {
      ...choice,
      selector: view === "observed" ? observedSelector : selector,
      reference,
    },
  });

  if (dataModes.length === 0) {
    return (
      <section className={base.panel} data-testid="heat-outlook">
        <p role="status">
          No outlook views are enabled for this outcome. Update the model settings to
          enable a published view.
        </p>
        {observedCapability?.reason && <p>{observedCapability.reason}</p>}
      </section>
    );
  }

  return (
    <section
      className={base.panel}
      aria-labelledby="heat-outlook-title"
      aria-busy={busy}
      data-testid="heat-outlook"
    >
      <p className={base.eyebrow}>Climate attributable health risk</p>
      <h2 id="heat-outlook-title" className={base.question}>
        What share of{" "}
        <strong className={base.inlineStatic}>{outcomeLabel.toLowerCase()}</strong>{" "}
        cases in <strong className={base.inlineStatic}>{place}</strong> may be
        attributable to heat exposure?
      </h2>

      <Tabs
        className={styles.viewTabs}
        ariaLabel="Outlook view"
        items={VIEW_TABS.map((item) => ({
          ...item,
          disabled: item.value === "observed" ? !observedOpen : !projectedOpen,
        }))}
        value={view}
        onChange={(next) => choose({ view: next })}
      />

      {!observedEnabled && (
        <p className={styles.note} role="status">
          {observedCapability?.reason ??
            "Observed estimates are not available for this place and outcome."}
        </p>
      )}
      {!projectionEnabled && (
        <p className={styles.note} role="status">
          Projected estimates are unavailable for this place and outcome or turned off
          in model settings.
        </p>
      )}
      {!showMonthlyObserved && (
        <p className={styles.note} data-testid="outlook-source">
          {view === "observed"
            ? `Observed · ERA5 with model release ${observedData?.release ?? observedCapability?.release ?? "not available"}`
            : `Projected · Published model release ${projectedData?.release ?? projectionRelease ?? "loading"}`}
        </p>
      )}

      {showMonthlyObserved ? (
        observedContent
      ) : (
        <>
          {view === "projection" && observed.state === "error" && (
            <p className={styles.note} role="alert">
              Observed months could not load, so the projection is shown.
            </p>
          )}
          {settled.state === "missing" && (
            <p className={styles.note} role="status">
              {view === "observed"
                ? "Observed months are not available for this place."
                : "No projection has been published for this place and outcome yet."}
            </p>
          )}
          {settled.state === "error" && (
            <p className={styles.note} role="alert">
              {view === "observed"
                ? "The observed estimate could not load."
                : "The heat outlook could not load."}
            </p>
          )}

          {selectors.length > 0 && (
            <div className={styles.controlBox} data-busy={busy || undefined}>
              <ControlRow label={outcome === "lbw" ? "Pregnancy window" : "Age group"}>
                <Select
                  aria-label={outcome === "lbw" ? "Pregnancy window" : "Age group"}
                  value={resolvedSelector}
                  options={selectors.map((option) => ({
                    value: option.code,
                    label: option.label,
                  }))}
                  onChange={(next) =>
                    choose(
                      view === "observed"
                        ? { observedSelector: next, month: undefined }
                        : { selector: next },
                    )
                  }
                />
              </ControlRow>
              {view === "observed" && observedData && (
                <ObservedControls
                  observed={observedData}
                  onMonth={(next) => choose({ month: next })}
                />
              )}
              {view === "projection" && projectedData && (
                <ProjectedControls
                  outlook={projectedData}
                  reference={reference}
                  choose={choose}
                />
              )}
            </div>
          )}

          {shown.note && (
            <p className={styles.warning} role="note">
              {shown.note}
            </p>
          )}

          <div className={styles.results} data-busy={busy || undefined}>
            <div className={base.riskLayout}>
              <div className={base.estimate}>
                {shown.percent !== null && shown.percent > 0 ? (
                  <div className={base.iconArrayWrap}>
                    <IconArray
                      value={Math.max(1, Math.round(shown.percent))}
                      figure={figure}
                    />
                  </div>
                ) : (
                  <div className={base.emptyGrid} aria-hidden="true" />
                )}

                {(view === "observed" ? observedData : projectedData) && (
                  <div className={base.summary} data-testid="outlook-estimate">
                    <p className={base.eyebrow}>{place}</p>
                    <p className={base.stat}>
                      {shown.percent !== null ? (
                        <>
                          <strong>{shown.percent.toFixed(1)}%</strong> of{" "}
                          {outcomeLabel.toLowerCase()} cases in {place} may be
                          attributed to heat {shown.when}
                          {shown.range}.
                        </>
                      ) : (
                        shown.message
                      )}
                    </p>
                    {shown.change && <p className={styles.change}>{shown.change}</p>}
                    {shown.ratio && (
                      <p className={styles.change} data-testid="outlook-ratio">
                        {RATIO_LABEL[shown.ratio.kind]} {shown.ratio.value.toFixed(2)}{" "}
                        (95% CI {shown.ratio.low.toFixed(2)}–
                        {shown.ratio.high.toFixed(2)})
                      </p>
                    )}
                    {shown.ratio && (
                      <div className={base.precisionRow}>
                        <span className={base.precisionLabel}>Precision:</span>
                        <PrecisionBadge
                          level={shown.ratio.precision}
                          onClick={() => setPrecisionOpen(true)}
                        />
                      </div>
                    )}
                    {shown.thin && (
                      <p className={base.modelScopeNote} role="note">
                        {shown.thin}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className={base.mapColumn}>
                {/* Mounted once the view has resolved its month and selector, so
                the first load asks for one map rather than one per guess. A
                place with nothing to show keeps the map, so another place
                can be picked from it. */}
                {(view === "observed" ? observedData : projectedData) ||
                settled.state !== "loading" ? (
                  <SpatialRiskMap
                    embedded
                    geographyId={mapGeographyId}
                    accessToken={accessToken}
                    outcome={outcome}
                    selectedGeographyId={geographyId}
                    onSelect={onSelectArea}
                    source={mapSource}
                  />
                ) : (
                  <div className={styles.mapPlaceholder} aria-hidden="true" />
                )}
              </div>
            </div>
          </div>

          {view === "observed" && observedData && (
            <ObservedDetails observed={observedData} />
          )}
          {view === "projection" && projectedData && (
            <details className={base.details}>
              <summary>Seasonal pattern and all periods</summary>
              <p className={styles.note}>{projectedData.reference_note}</p>
              {projectedData.months.length > 0 && (
                <TypicalMonths outlook={projectedData} />
              )}
              <PeriodSummary outlook={projectedData} />
            </details>
          )}
        </>
      )}

      <PrecisionInfoModal
        open={precisionOpen}
        onClose={() => setPrecisionOpen(false)}
        activeLevel={shown.ratio?.precision}
      />
    </section>
  );
}

/**
 * Loads one view and keeps the last answer on screen while the next one
 * arrives, so switching a month or county dims the figures instead of
 * blanking them.
 */
function useLoaded<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Load<T> {
  const [result, setResult] = useState<Load<T>>({ data: null, state: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setResult((current) => ({ data: current.data, state: "loading" }));
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ data, state: "ready" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          data: null,
          state: error instanceof OutlookNotPublished ? "missing" : "error",
        });
      });
    return () => controller.abort();
    // The caller lists every input of load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return result;
}

function useMapSource({
  view,
  outcome,
  mapGeographyId,
  observed,
  projected,
  choice,
}: {
  view: OutlookView;
  outcome: string;
  mapGeographyId: string;
  observed: ObservedRisk | null;
  projected: HeatOutlook | null;
  choice: Choices & { reference: OutlookReference };
}) {
  // The map shows the selection the API resolved, so it matches the figures,
  // falling back to the reader's own choices until a resolved one exists.
  const selection =
    view === "observed"
      ? {
          outcome,
          month: observed?.month ?? choice.month,
          selector: observed?.selector ?? choice.selector,
        }
      : {
          outcome,
          scenario: projected?.scenario ?? choice.scenario,
          period: projected?.period ?? choice.period,
          selector: projected?.selector ?? choice.selector,
          reference: choice.reference,
        };
  const key = `${view}:${Object.values(selection).join(":")}`;
  return useMemo(
    () => ({
      key,
      load: (token: string) =>
        view === "observed"
          ? fetchObservedRiskMap(mapGeographyId, token, selection)
          : fetchHeatOutlookMap(mapGeographyId, token, selection),
    }),
    // key carries every field of selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapGeographyId, key],
  );
}

type Figure = {
  percent: number | null;
  when: string;
  range: string;
  message: string;
  change: string | null;
  ratio: OutlookRatio | null;
  thin: string | null;
  note: string | null;
};

const EMPTY_FIGURE: Figure = {
  percent: null,
  when: "",
  range: "",
  message: "",
  change: null,
  ratio: null,
  thin: null,
  note: null,
};

function observedFigure(observed: ObservedRisk | null): Figure {
  if (!observed) return EMPTY_FIGURE;
  const estimate = observed.estimate;
  const note = observed.selector_note;
  if (!estimate || !observed.month) {
    return {
      ...EMPTY_FIGURE,
      note,
      message:
        observed.outcome === "lbw"
          ? "No month has enough ERA5 data yet: a birth month needs its own temperature and the eight months before it."
          : "No month has enough ERA5 data yet: every day needs the three days before it.",
    };
  }
  const where =
    observed.level === "country" ? `, averaged over ${estimate.counties} counties` : "";
  return {
    percent: estimate.value_percent,
    when: `in ${monthLabel(observed.month)}${where}`,
    range: ciText(estimate.low_percent, estimate.high_percent),
    message: estimate.message ?? note ?? "No estimate is reported for this choice.",
    change: null,
    ratio: estimate.ratio,
    thin:
      estimate.thin_data && estimate.value_percent !== null ? estimate.message : null,
    note,
  };
}

function projectedFigure(
  outlook: HeatOutlook | null,
  reference: OutlookReference,
): Figure {
  if (!outlook) return EMPTY_FIGURE;
  const periodLabel = outlook.periods.find(
    (option) => option.code === outlook.period,
  )?.label;
  const note = outlook.selector_note;
  if (reference === "peak" && outlook.peak_season) {
    const peak = outlook.peak_season;
    return {
      ...EMPTY_FIGURE,
      percent: peak.part.value_percent,
      when: `in the peak heat season (${peak.label}) of ${periodLabel}`,
      range:
        peak.gcm_min_percent !== null && peak.gcm_max_percent !== null
          ? ` (climate-model range ${peak.gcm_min_percent.toFixed(1)} to ${peak.gcm_max_percent.toFixed(1)}%)`
          : "",
      message: peak.part.message ?? note ?? "No peak-season estimate is reported.",
      note,
    };
  }
  const current = outlook.period_summary.find((row) => row.period === outlook.period);
  const heat = current?.parts.find((part) => part.side === "heat") ?? null;
  const baseline = outlook.period_summary.find((row) => row.is_baseline);
  const percent = heat?.value_percent ?? null;
  return {
    percent,
    when: `in an average year of ${periodLabel}`,
    range: ciText(heat?.low_percent ?? null, heat?.high_percent ?? null),
    message: heat?.message ?? note ?? "No annual summary is reported for this choice.",
    change:
      heat && heat.change_pp !== null && percent !== null
        ? `${signed(heat.change_pp)} points compared with ${baseline?.label} (95% CI ${signed(heat.change_low_pp)} to ${signed(heat.change_high_pp)})`
        : null,
    ratio: heat?.ratio ?? null,
    thin: heat?.thin_data && heat.message && percent !== null ? heat.message : null,
    note,
  };
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <div className={styles.controlValue}>{children}</div>
    </div>
  );
}

function Choice<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: Value; label: string; disabled?: boolean; title?: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div className={styles.choices} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.choice}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ObservedControls({
  observed,
  onMonth,
}: {
  observed: ObservedRisk;
  onMonth: (month: string) => void;
}) {
  const intensity = useMemo(
    () =>
      Object.fromEntries(
        observed.history
          .filter((item) => item.value_percent !== null)
          .map((item) => [item.month, item.value_percent as number]),
      ),
    [observed.history],
  );
  return (
    <ControlRow label="Month">
      <MonthYearPicker
        idPrefix="observed-month"
        available={observed.available_months}
        observed={observed.available_months}
        value={observed.month ?? ""}
        intensity={intensity}
        onChange={onMonth}
      />
    </ControlRow>
  );
}

function ProjectedControls({
  outlook,
  reference,
  choose,
}: {
  outlook: HeatOutlook;
  reference: OutlookReference;
  choose: (next: Choices) => void;
}) {
  const baseline =
    outlook.period_summary.find((period) => period.is_baseline)?.period ??
    outlook.periods[0]?.code;
  const periodLength = (code: string) => {
    const years = code.match(/(\d{4})\D+(\d{4})/);
    return years ? Number(years[2]) - Number(years[1]) + 1 : 0;
  };
  const durations = [5, 10, 20].filter((years) =>
    outlook.periods.some(
      (period) => period.code !== baseline && periodLength(period.code) === years,
    ),
  );
  const selectedLength = periodLength(outlook.period);
  const selectablePeriods = outlook.periods.filter(
    (period) =>
      durations.length < 2 ||
      period.code === baseline ||
      selectedLength === periodLength(period.code),
  );
  return (
    <>
      <ControlRow label="Scenario">
        <Choice
          label="Scenario"
          value={outlook.scenario}
          options={outlook.scenarios.map((option: OutlookOption) => ({
            value: option.code,
            label: option.label,
          }))}
          onChange={(next) => choose({ scenario: next })}
        />
      </ControlRow>
      {durations.length > 1 && (
        <ControlRow label="Period length">
          <Choice
            label="Period length"
            value={String(selectedLength)}
            options={durations.map((years) => ({
              value: String(years),
              label: `${years} years`,
            }))}
            onChange={(next) => {
              const start = outlook.period.match(/\d{4}/)?.[0];
              const candidates = outlook.periods.filter(
                (period) => periodLength(period.code) === Number(next),
              );
              const nextPeriod =
                candidates.find((period) => period.code.startsWith(start ?? "")) ??
                candidates.find(
                  (period) => Number(period.code.match(/\d{4}/)?.[0]) >= 2021,
                ) ??
                candidates[0];
              if (nextPeriod) choose({ period: nextPeriod.code, reference: "annual" });
            }}
          />
        </ControlRow>
      )}
      <ControlRow label="Time horizon">
        {selectablePeriods.length > 6 ? (
          <Select
            aria-label="Time horizon"
            value={outlook.period}
            options={selectablePeriods.map((option) => ({
              value: option.code,
              label:
                option.code === baseline ? `${option.label} (baseline)` : option.label,
            }))}
            onChange={(next) => choose({ period: next })}
          />
        ) : (
          <Choice
            label="Time horizon"
            value={outlook.period}
            options={selectablePeriods.map((option) => ({
              value: option.code,
              label:
                option.code === baseline ? `${option.label} (baseline)` : option.label,
            }))}
            onChange={(next) => choose({ period: next })}
          />
        )}
      </ControlRow>
      <ControlRow label="Reference period">
        <Choice
          label="Reference period"
          value={reference}
          options={[
            { value: "annual", label: "Annual average" },
            {
              value: "peak",
              label: outlook.peak_season
                ? `Peak heat season (${outlook.peak_season.label})`
                : "Peak heat season",
              disabled: !outlook.peak_season,
              title: outlook.peak_season
                ? undefined
                : "No seasonal pattern for this choice",
            },
          ]}
          onChange={(next) => choose({ reference: next })}
        />
      </ControlRow>
      <p className={styles.note}>
        Projections average the selected years under a climate scenario. They do not
        predict the conditions in any individual year.
      </p>
    </>
  );
}

function ObservedDetails({ observed }: { observed: ObservedRisk }) {
  return (
    <details className={base.details}>
      <summary>Temperatures behind this estimate</summary>
      <p className={styles.note}>{observed.reference_note}</p>
      {observed.inputs.length > 0 && (
        <div className={styles.block}>
          <table className={styles.table} aria-label="Temperatures used">
            <thead>
              <tr>
                <th scope="col">{observed.outcome === "lbw" ? "Month" : "Measure"}</th>
                <th scope="col">ERA5</th>
                <th scope="col">On the model&apos;s scale</th>
              </tr>
            </thead>
            <tbody>
              {observed.inputs.map((item) => (
                <tr key={item.label} data-counted={item.counted || undefined}>
                  <th scope="row">
                    {item.label}
                    {!item.counted && (
                      <span className={styles.flag}> not in window</span>
                    )}
                  </th>
                  <td>{item.era5_c === null ? "–" : `${item.era5_c.toFixed(1)} °C`}</td>
                  <td>
                    {item.era5_c === null
                      ? item.model_scale_c.toFixed(0)
                      : `${item.model_scale_c.toFixed(1)} °C`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.note}>{observed.calibration_note}</p>
      <p className={styles.source}>
        Copernicus ERA5, scored on request with the modelling team&apos;s DLNM (release{" "}
        {observed.release}).
      </p>
    </details>
  );
}

function TypicalMonths({ outlook }: { outlook: HeatOutlook }) {
  const sides = outlook.months[0].parts.map((part) => part.side);
  const showOddsRatio = outlook.months.some((month) => month.odds_ratio);
  const peak = new Set(outlook.peak_season?.months ?? []);
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
            <tr key={month.month} data-peak={peak.has(month.month) || undefined}>
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

function ciText(low: number | null, high: number | null): string {
  return low === null || high === null
    ? ""
    : ` (95% CI ${low.toFixed(1)} to ${high.toFixed(1)}%)`;
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTHS[Number(index) - 1]} ${year}`;
}

function signed(value: number | null): string {
  if (value === null) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
