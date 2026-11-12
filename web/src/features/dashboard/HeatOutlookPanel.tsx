"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { IconArray } from "@/components/IconArray";
import { PrecisionBadge } from "@/components/PrecisionBadge";
import { PrecisionInfoModal } from "@/components/PrecisionInfoModal";
import { Select } from "@/components/Select";
import { Tabs } from "@/components/Tabs";
import {
  fetchForecast,
  fetchForecastMap,
  fetchHeatOutlook,
  fetchHeatOutlookMap,
  fetchObservedRisk,
  fetchObservedRiskMap,
  OutlookNotPublished,
  type HeatOutlook,
  type ObservedRisk,
  type OutlookCapabilities,
  type OutlookOption,
  type OutlookRatio,
  type OutlookReference,
  type OutlookView,
  type PlaceForecast,
} from "@/lib/heatOutlookClient";

import base from "./HeatLbwLinkPanel.module.css";
import { MonthYearPicker } from "./MonthYearPicker";
import styles from "./HeatOutlookPanel.module.css";
import { prefetchMapSource, SpatialRiskMap } from "./SpatialRiskMap";

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
/** The concise modelling methodology in the published documentation. */
const METHODOLOGY_URL = "https://chart-scope.github.io/CHART/docs/methodology/";
const RATIO_LABEL = { odds_ratio: "Odds ratio", risk_ratio: "Risk ratio" } as const;
const VIEW_TABS = [
  { value: "observed", label: "Observed" },
  { value: "forecast", label: "Forecasted" },
  { value: "projection", label: "Projected" },
] as const;

/** The dashboard's tabs: the two published views plus the seasonal forecast. */
export type DashboardView = OutlookView | "forecast";

export type OutlookChoices = {
  view?: DashboardView;
  /** Observed and projected releases can have different selector codes. */
  observedSelector?: string;
  selector?: string;
  month?: string;
  /** A forecast month, kept apart from the observed month it never shares. */
  forecastMonth?: string;
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
  /** Its name, for the map heading. */
  mapPlaceName?: string;
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
  onSelectArea?: (geographyId: string, selection: OutlookChoices) => void;
  /** Offers "Save plan" for the view as currently resolved. */
  onSavePlan?: (selection: OutlookChoices) => void;
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
  mapPlaceName,
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
  onSavePlan,
}: Props) {
  // Choices are kept per outcome: a different outcome has different windows
  // and periods, while a different area keeps them for comparison.
  const [picked, setPicked] = useState<Choices & { outcome: string }>({ outcome });
  const choice: Choices = selection ?? (picked.outcome === outcome ? picked : {});
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const { selector, observedSelector, month, forecastMonth, scenario, period } = choice;
  const reference = choice.reference ?? "annual";

  const observedEnabled = dataModes.includes("observed");
  const monthlyObserved = observedCapability?.source === "monthly";
  const outlookObserved = observedEnabled && !monthlyObserved;
  const observed = useLoaded<ObservedRisk>(
    ["observed", geographyId, outcome, month, observedSelector, outlookObserved],
    (signal) =>
      outlookObserved
        ? fetchObservedRisk(
            geographyId,
            accessToken,
            { outcome, month, selector: observedSelector },
            signal,
          )
        : Promise.reject(new OutlookNotPublished(geographyId)),
  );
  const projectionEnabled = dataModes.includes("projection");
  const projected = useLoaded<HeatOutlook>(
    ["projection", geographyId, outcome, scenario, period, selector, projectionEnabled],
    (signal) =>
      projectionEnabled
        ? fetchHeatOutlook(
            geographyId,
            accessToken,
            { outcome, scenario, period, selector },
            signal,
          )
        : Promise.reject(new OutlookNotPublished(geographyId)),
  );

  // Another outcome's figures are never shown. Another place's stay on
  // screen, dimmed and still named after their place, only while this
  // place's answer loads, so switching area does not blank the card; a place
  // with nothing to show then clears them.
  const observedData = outlookObserved ? currentData(observed, outcome) : null;
  const projectedData = projectionEnabled ? currentData(projected, outcome) : null;

  const projectedOpen =
    projectionEnabled &&
    (projected.state === "loading" ||
      (projected.state === "ready" && projectedData !== null));
  // Observed is the default once it has a month to show; a place or setting
  // without it opens on the projection instead.
  const view: DashboardView =
    choice.view ??
    (!observedEnabled
      ? "projection"
      : !projectionEnabled ||
          monthlyObserved ||
          (observedData && observedData.available_months.length > 0) ||
          observed.state === "loading"
        ? "observed"
        : projectedOpen
          ? "projection"
          : "observed");
  // All three views load together, so switching tab is instant. A place
  // without a C3S forecast shows the tab with a note rather than hiding it.
  const forecast = useLoaded<PlaceForecast>(
    ["forecast", geographyId, outcome],
    (signal) => fetchForecast(geographyId, outcome, { accessToken, signal }),
  );
  const forecastData = currentData(forecast, outcome);
  const resolvedChoices: Choices = {
    ...choice,
    view,
    // Responses may still contain the previous selection while a new one
    // loads. Explicit URL choices must win when another control is changed.
    month: month ?? observedData?.month ?? undefined,
    forecastMonth: forecastMonth ?? defaultForecastMonth(forecastData),
    observedSelector: observedSelector ?? observedData?.selector,
    scenario: scenario ?? projectedData?.scenario,
    period: period ?? projectedData?.period,
    selector: selector ?? projectedData?.selector,
    reference,
  };
  const choose = (next: Choices) => {
    const merged = { ...resolvedChoices, ...next };
    setPicked({ ...merged, outcome });
    onSelectionChange?.(merged);
  };
  const settled =
    view === "observed" ? observed : view === "forecast" ? forecast : projected;
  const showMonthlyObserved = view === "observed" && monthlyObserved && observedEnabled;
  const busy = !showMonthlyObserved && settled.state === "loading";

  // One name on every tab, so switching changes only the figures (the
  // forecast carries none, and the two releases may spell it differently).
  const place =
    observedData?.place ?? projectedData?.place ?? placeLabel ?? "this place";
  const selectors =
    (view === "observed"
      ? observedData?.selectors
      : view === "projection"
        ? projectedData?.selectors
        : undefined) ?? [];
  const resolvedSelector =
    view === "observed" ? observedData?.selector : projectedData?.selector;
  const viewData =
    view === "observed"
      ? observedData
      : view === "forecast"
        ? forecastData
        : projectedData;

  const shown =
    view === "observed"
      ? observedFigure(observedData)
      : view === "forecast"
        ? forecastFigure(forecastData, resolvedChoices.forecastMonth)
        : projectedFigure(projectedData, reference);

  const sourceFor = (target: DashboardView) =>
    mapSourceFor({
      view: target,
      outcome,
      mapGeographyId,
      accessToken,
      observed: observedData,
      projected: projectedData,
      forecastMonth: forecastMonth ?? defaultForecastMonth(forecastData),
      choice: {
        ...choice,
        selector: target === "observed" ? observedSelector : selector,
        reference,
      },
    });
  const currentSource = sourceFor(view);
  const mapSource = useMemo(
    () => currentSource,
    // The key carries every input of the source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapGeographyId, currentSource.key],
  );

  // Once this tab is drawn, fetch the other tabs' maps too, so switching
  // only recolours the shapes already on screen.
  const otherSources = (["observed", "projection", "forecast"] as const)
    .filter((target) => target !== view)
    .filter((target) =>
      target === "observed"
        ? outlookObserved && observedData !== null
        : target === "projection"
          ? projectionEnabled && projectedData !== null
          : forecastData !== null,
    )
    .map(sourceFor);
  const otherKeys = otherSources.map((source) => source.key).join("|");
  const settledReady = settled.state === "ready";
  useEffect(() => {
    if (!settledReady) return;
    for (const source of otherSources)
      prefetchMapSource(mapGeographyId, accessToken, source);
    // otherKeys carries every source's inputs; the token rotates without
    // changing what is asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledReady, mapGeographyId, otherKeys]);

  // The icon array stays drawn while a view loads and shades over to the new
  // share when it lands, rather than emptying in between.
  const lastPercent = useRef<number | null>(null);
  if (shown.percent !== null) lastPercent.current = shown.percent;
  const arrayPercent = shown.percent ?? (busy ? lastPercent.current : null);
  // The map, once drawn, stays mounted for every later tab and selection.
  const mapDrawn = useRef(false);
  if (viewData || settled.state !== "loading") mapDrawn.current = true;

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
      // Not shown: the release behind the figures, for checks and support.
      data-release={
        view === "observed"
          ? (observedData?.release ?? observedCapability?.release)
          : view === "forecast"
            ? forecastData?.issue
            : (projectedData?.release ?? projectionRelease ?? undefined)
      }
    >
      <div className={styles.headRow}>
        <p className={`${base.eyebrow} ${styles.label}`}>
          Climate attributable health risk
          <a
            className={styles.methodology}
            href={METHODOLOGY_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="See more about how these estimates are made"
          >
            See more
          </a>
        </p>
        {/* Saved plans hold observed or projected views only; the button
        stays put on the forecast so the tabs do not shift the layout. */}
        {onSavePlan && (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Icon name="bookmark" size={14} />}
            disabled={busy || view === "forecast"}
            title={
              view === "forecast"
                ? "Forecasts cannot be saved to a plan yet"
                : undefined
            }
            onClick={() => onSavePlan(resolvedChoices)}
          >
            Save plan
          </Button>
        )}
      </div>
      <h2 id="heat-outlook-title" className={base.question}>
        What share of{" "}
        <strong className={base.inlineStatic}>{outcomeLabel.toLowerCase()}</strong>{" "}
        cases in <strong className={base.inlineStatic}>{place}</strong> may be
        attributable to heat exposure?
      </h2>

      <Tabs
        className={styles.viewTabs}
        ariaLabel="Outlook view"
        items={VIEW_TABS}
        value={view}
        onChange={(next) => choose({ view: next })}
      />

      {view === "observed" && !observedEnabled && (
        <p className={styles.note} role="status">
          {observedCapability?.reason ??
            "Observed estimates are not available for this place and outcome."}
        </p>
      )}
      {view === "projection" && !projectionEnabled && (
        <p className={styles.note} role="status">
          Projected estimates are unavailable for this place and outcome or turned off
          in model settings.
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
          {settled.state === "missing" &&
            (view === "observed"
              ? observedEnabled
              : view === "projection"
                ? projectionEnabled
                : true) && (
              <p className={styles.note} role="status">
                {view === "observed"
                  ? "Observed months are not available for this place."
                  : view === "forecast"
                    ? "No seasonal forecast is available for this place yet."
                    : "No projection has been published for this place and outcome yet."}
              </p>
            )}
          {settled.state === "error" && (
            <p className={styles.note} role="alert">
              {view === "observed"
                ? "The observed estimate could not load."
                : view === "forecast"
                  ? "The seasonal forecast could not load."
                  : "The heat outlook could not load."}
            </p>
          )}

          {viewData && (
            <div className={styles.controlBox} data-busy={busy || undefined}>
              {/* The API lists only the windows or age groups Settings leaves
              on; with just the default there is nothing to choose. */}
              {selectors.length > 1 && (
                <ControlRow
                  label={outcome === "lbw" ? "Pregnancy window" : "Age group"}
                >
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
              )}
              {view === "observed" && observedData && (
                <ObservedControls
                  observed={observedData}
                  onMonth={(next) => choose({ month: next })}
                />
              )}
              {view === "forecast" && forecastData && (
                <ForecastControls
                  forecast={forecastData}
                  month={resolvedChoices.forecastMonth}
                  onMonth={(next) => choose({ forecastMonth: next })}
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

          {view === "observed" && viewData && <MonthLegend unavailable="No data yet" />}

          <div className={styles.results}>
            <div className={base.riskLayout}>
              <div className={base.estimate}>
                {arrayPercent !== null && arrayPercent > 0 ? (
                  <div className={base.iconArrayWrap}>
                    <IconArray
                      value={Math.max(1, Math.round(arrayPercent))}
                      figure={figure}
                    />
                  </div>
                ) : (
                  <div className={base.emptyGrid} aria-hidden="true" />
                )}

                {viewData && (
                  <div className={base.summary} data-testid="outlook-estimate">
                    <p className={base.eyebrow}>{place}</p>
                    <p className={base.stat}>
                      {shown.percent !== null ? (
                        <>
                          {shown.lead},{" "}
                          <strong className={styles.share}>
                            {shown.percent.toFixed(1)}
                          </strong>
                          % of {outcomeLabel.toLowerCase()} cases in {place} may be
                          attributable to heat exposure.
                        </>
                      ) : (
                        shown.message
                      )}
                    </p>
                    {shown.percent !== null && shown.range && (
                      <p className={styles.change}>{shown.range}</p>
                    )}
                    {shown.ratio && (
                      <p className={styles.change} data-testid="outlook-ratio">
                        {RATIO_LABEL[shown.ratio.kind]} {shown.ratio.value.toFixed(2)}{" "}
                        (95% CI {shown.ratio.low.toFixed(2)}–
                        {shown.ratio.high.toFixed(2)})
                      </p>
                    )}
                    {shown.change && <p className={styles.change}>{shown.change}</p>}
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
                {mapDrawn.current ? (
                  <SpatialRiskMap
                    embedded
                    geographyId={mapGeographyId}
                    placeName={mapPlaceName}
                    accessToken={accessToken}
                    outcome={outcome}
                    selectedGeographyId={geographyId}
                    onSelect={(nextGeographyId) =>
                      onSelectArea?.(nextGeographyId, resolvedChoices)
                    }
                    source={mapSource}
                  />
                ) : (
                  <div className={styles.mapPlaceholder} aria-hidden="true" />
                )}
              </div>
            </div>
          </div>
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

/** The view's figures for this outcome. Another place's are kept only
 * mid-switch: `useLoaded` clears them when the new place fails or has none. */
function currentData<T extends { outcome: string }>(
  load: Load<T>,
  outcome: string,
): T | null {
  return load.data?.outcome === outcome ? load.data : null;
}

/**
 * Loads one view through the shared query cache. A place, month or setting
 * seen before answers from memory; a new one keeps the last answer on screen
 * (dimmed as loading) until it arrives, so a switch never blanks the card.
 * The key leaves out the access token: a rotation is not a new question.
 */
function useLoaded<T>(
  key: readonly unknown[],
  load: (signal: AbortSignal) => Promise<T>,
): Load<T> {
  const query = useQuery({
    queryKey: ["outlook-view", ...key],
    queryFn: ({ signal }) => load(signal),
    placeholderData: keepPreviousData,
    // Published views change on a release or a saved setting, not while a
    // session reads them; ModelSettingsCard invalidates them on a save.
    staleTime: Infinity,
    retry: (failures, error) => !(error instanceof OutlookNotPublished) && failures < 1,
  });
  if (query.isError) {
    return {
      data: null,
      state: query.error instanceof OutlookNotPublished ? "missing" : "error",
    };
  }
  if (query.isPending || query.isPlaceholderData) {
    return { data: query.data ?? null, state: "loading" };
  }
  return { data: query.data, state: "ready" };
}

function mapSourceFor({
  view,
  outcome,
  mapGeographyId,
  accessToken,
  observed,
  projected,
  forecastMonth,
  choice,
}: {
  view: DashboardView;
  outcome: string;
  mapGeographyId: string;
  accessToken: string;
  observed: ObservedRisk | null;
  projected: HeatOutlook | null;
  forecastMonth: string | undefined;
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
      : view === "forecast"
        ? { outcome, month: forecastMonth }
        : {
            outcome,
            scenario: projected?.scenario ?? choice.scenario,
            period: projected?.period ?? choice.period,
            selector: projected?.selector ?? choice.selector,
            reference: choice.reference,
          };
  const key = `${view}:${Object.values(selection).join(":")}`;
  return {
    key,
    cacheScope: view,
    load: (token: string, geometry?: boolean) =>
      view === "observed"
        ? fetchObservedRiskMap(mapGeographyId, token, selection, geometry)
        : view === "forecast"
          ? fetchForecastMap(
              mapGeographyId,
              outcome,
              forecastMonth,
              token || accessToken,
              geometry,
            )
          : fetchHeatOutlookMap(mapGeographyId, token, selection, geometry),
  };
}

type Figure = {
  percent: number | null;
  /** Opens the summary sentence: the temperature and when it applies. */
  lead: string;
  /** The share's interval or spread, under the sentence. */
  range: string | null;
  message: string;
  change: string | null;
  ratio: OutlookRatio | null;
  thin: string | null;
};

const EMPTY_FIGURE: Figure = {
  percent: null,
  lead: "",
  range: null,
  message: "",
  change: null,
  ratio: null,
  thin: null,
};

function observedFigure(observed: ObservedRisk | null): Figure {
  if (!observed) return EMPTY_FIGURE;
  const estimate = observed.estimate;
  const note = observed.selector_note;
  if (!estimate || !observed.month) {
    return {
      ...EMPTY_FIGURE,
      message:
        observed.outcome === "lbw"
          ? "No month has enough ERA5 data yet: a birth month needs its own temperature and the eight months before it."
          : "No month has enough ERA5 data yet: every day needs the three days before it.",
    };
  }
  const where =
    observed.level === "country" ? `, averaged over ${estimate.counties} counties` : "";
  // LBW lists each pregnancy month by name; under-5 has one mean daily max.
  const label = monthLabel(observed.month);
  const temp = observed.inputs.find(
    (item) => item.label === label || item.label === "Mean daily max",
  )?.era5_c;
  return {
    percent: estimate.value_percent,
    lead: sentenceCase(`${temperatureLead("", temp)}in ${label}${where}`),
    range: ciText(estimate.low_percent, estimate.high_percent),
    message: estimate.message ?? note ?? "No estimate is reported for this choice.",
    change: null,
    ratio: estimate.ratio,
    thin:
      estimate.thin_data && estimate.value_percent !== null ? estimate.message : null,
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
  const peak =
    reference === "season"
      ? outlook.heat_season_share
      : reference === "peak"
        ? outlook.peak_season
        : null;
  if (peak) {
    const when =
      reference === "season"
        ? "the peak heat season"
        : `the highest-risk months (${peak.label})`;
    return {
      ...EMPTY_FIGURE,
      percent: peak.part.value_percent,
      lead: `${temperatureLead("projected average", meanTmax(outlook, peak.months))}in ${when} of ${periodLabel}`,
      range:
        peak.gcm_min_percent !== null && peak.gcm_max_percent !== null
          ? `Climate-model range ${peak.gcm_min_percent.toFixed(1)} to ${peak.gcm_max_percent.toFixed(1)}%`
          : null,
      message: peak.part.message ?? note ?? "No peak-season estimate is reported.",
    };
  }
  const current = outlook.period_summary.find((row) => row.period === outlook.period);
  const heat = current?.parts.find((part) => part.side === "heat") ?? null;
  const baseline = outlook.period_summary.find((row) => row.is_baseline);
  const percent = heat?.value_percent ?? null;
  return {
    percent,
    lead: `${temperatureLead("projected average annual", meanTmax(outlook))}in ${periodLabel}`,
    range: ciText(heat?.low_percent ?? null, heat?.high_percent ?? null),
    message: heat?.message ?? note ?? "No annual summary is reported for this choice.",
    change:
      heat && heat.change_pp !== null && percent !== null
        ? `${signed(heat.change_pp)} points compared with ${baseline?.label} (95% CI ${signed(heat.change_low_pp)} to ${signed(heat.change_high_pp)})`
        : null,
    ratio: heat?.ratio ?? null,
    thin: heat?.thin_data && heat.message && percent !== null ? heat.message : null,
  };
}

/** The seasonal forecast for one month, central estimate and its precision. */
function forecastFigure(
  forecast: PlaceForecast | null,
  month: string | undefined,
): Figure {
  if (!forecast || !month) return EMPTY_FIGURE;
  const row = forecast.months.find((item) => item.month === month);
  if (!row || row.value_percent === null) {
    return {
      ...EMPTY_FIGURE,
      message: "No forecast estimate is reported for this month.",
    };
  }
  return {
    ...EMPTY_FIGURE,
    percent: row.value_percent,
    lead: `${temperatureLead("forecasted", row.tmax_c)}in ${monthLabel(month)}`,
    range:
      row.low_percent !== null && row.high_percent !== null
        ? `Forecast-system range ${row.low_percent.toFixed(1)} to ${row.high_percent.toFixed(1)}%`
        : null,
    ratio: row.ratio ?? null,
  };
}

function defaultForecastMonth(forecast: PlaceForecast | null): string | undefined {
  return forecast?.months.find((item) => item.value_percent !== null)?.month;
}

/** "At a forecasted maximum temperature of 31.2 °C " — empty without one. */
function temperatureLead(kind: string, celsius: number | null | undefined): string {
  if (celsius === null || celsius === undefined) return "";
  return `At a ${kind ? `${kind} ` : ""}maximum temperature of ${celsius.toFixed(1)} °C `;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Mean daily maximum over the typical months given (all twelve by default). */
function meanTmax(outlook: HeatOutlook, months?: number[]): number | null {
  const temps = outlook.months
    .filter((item) => !months || months.includes(item.month))
    .map((item) => item.tmax_c)
    .filter((value): value is number => value !== null);
  return temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
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
  return (
    <MonthYearPicker
      idPrefix="observed-month"
      available={observed.available_months}
      value={observed.month ?? ""}
      renderRow={controlRow}
      onChange={onMonth}
    />
  );
}

/** A labelled row of the control box, for the month picker's two rows. */
function controlRow(label: string, content: ReactNode) {
  return <ControlRow label={label}>{content}</ControlRow>;
}

function ForecastControls({
  forecast,
  month,
  onMonth,
}: {
  forecast: PlaceForecast;
  month: string | undefined;
  onMonth: (month: string) => void;
}) {
  const months = forecast.months.filter((item) => item.value_percent !== null);
  const first = months[0]?.month;
  const last = months.at(-1)?.month;
  return (
    <>
      {/* Only the forecast's own months, in order; the year is written on
      the first month and on January rather than chosen from a dropdown. */}
      <ControlRow label="Month">
        <Choice
          label="Forecast month"
          value={month ?? ""}
          options={months.map((item, index) => {
            const [year, number] = item.month.split("-");
            const name = MONTHS[Number(number) - 1];
            return {
              value: item.month,
              label: index === 0 || number === "01" ? `${name} ${year}` : name,
            };
          })}
          onChange={onMonth}
        />
      </ControlRow>
      {first && last && (
        <p className={styles.note}>
          Forecasts are available for the next {months.length} months (
          {monthLabel(first)} – {monthLabel(last)}).
        </p>
      )}
    </>
  );
}

function MonthLegend({ unavailable }: { unavailable: string }) {
  return (
    <div className={styles.legend} aria-hidden="true">
      <span>
        <i data-key="selected" />
        Selected
      </span>
      <span>
        <i data-key="available" />
        Available
      </span>
      <span>
        <i data-key="off" />
        {unavailable}
      </span>
    </div>
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
  // One "Time horizon" row: the period lengths when the release publishes
  // several (picking one opens its first future period), else the periods.
  const periodOptions = outlook.periods.map((option) => ({
    value: option.code,
    label: option.code === baseline ? `${option.label} (baseline)` : option.label,
  }));
  return (
    <>
      <ControlRow label="Time horizon">
        {durations.length > 1 ? (
          <Choice
            label="Time horizon"
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
        ) : periodOptions.length > 6 ? (
          <Select
            aria-label="Time horizon"
            value={outlook.period}
            options={periodOptions}
            onChange={(next) => choose({ period: next })}
          />
        ) : (
          <Choice
            label="Time horizon"
            value={outlook.period}
            options={periodOptions}
            onChange={(next) => choose({ period: next })}
          />
        )}
      </ControlRow>
      <ControlRow label="Emission scenario">
        <ScenarioChoice
          value={outlook.scenario}
          options={outlook.scenarios}
          onChange={(next) => choose({ scenario: next })}
        />
      </ControlRow>
      <ControlRow label="Reference period">
        <Choice
          label="Reference period"
          value={reference}
          options={[
            { value: "annual", label: "Annual average" },
            {
              value: "season",
              label: "Peak heat season",
              disabled: !outlook.heat_season_share,
              title: outlook.heat_season_share
                ? "The heat season set in Settings"
                : "No heat season is set for this place",
            },
            {
              value: "peak",
              label: outlook.peak_season
                ? `Highest-risk months (${outlook.peak_season.label})`
                : "Highest-risk months",
              disabled: !outlook.peak_season,
              title: outlook.peak_season
                ? "The three months the model finds most affected by heat"
                : "No seasonal pattern for this choice",
            },
          ]}
          onChange={(next) => choose({ reference: next })}
        />
      </ControlRow>
    </>
  );
}

/** Emission scenarios as cards: the plain-language name over its SSP code. */
function ScenarioChoice({
  value,
  options,
  onChange,
}: {
  value: string;
  options: OutlookOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.scenarios} role="group" aria-label="Emission scenario">
      {options.map((option) => {
        // Published labels read "SSP3-7.0 (medium-high emissions)".
        const parts = option.label.match(/^(\S+)\s*\((.+)\)$/);
        const name = parts ? parts[2] : option.label;
        return (
          <button
            key={option.code}
            type="button"
            className={styles.scenario}
            aria-pressed={option.code === value}
            onClick={() => onChange(option.code)}
          >
            <span className={styles.scenarioName}>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </span>
            {parts && <span className={styles.scenarioCode}>{parts[1]}</span>}
            {option.code === value && (
              <Icon name="check" size={16} className={styles.scenarioTick} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ciText(low: number | null, high: number | null): string | null {
  return low === null || high === null
    ? null
    : `95% CI ${low.toFixed(1)} to ${high.toFixed(1)}%`;
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTHS[Number(index) - 1]} ${year}`;
}

function signed(value: number | null): string {
  if (value === null) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
