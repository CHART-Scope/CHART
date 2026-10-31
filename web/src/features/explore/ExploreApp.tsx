"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon, IconSprite, type IconName } from "@/components/Icon";
import { dashboardHref } from "@/features/dashboard/dashboardNavigation";
import { rememberReturnPath } from "@/lib/authClient";
import type { MapResponse } from "@/lib/dashboardClient";
import {
  fetchClimateLayer,
  fetchForecast,
  fetchForecastMap,
  fetchPopulation,
  fetchHeatOutlook,
  fetchHeatOutlookMap,
  fetchObservedRisk,
  fetchObservedRiskMap,
  type ClimateLayer,
  type ClimateLayerMap,
  type HeatOutlook,
  type ObservedRisk,
  type ForecastMap,
  type PlaceForecast,
  type PopulationMap,
  type PopulationMeasure,
} from "@/lib/heatOutlookClient";
import {
  listGeographies,
  listRecommendedActions,
  type RecommendedAction,
} from "@/lib/planningClient";
import { fetchVraMap } from "@/lib/vraClient";

import { ActionsDrawer, isHeatAction } from "./ActionsDrawer";
import { ExploreMap } from "./ExploreMap";
import { PlaceSearch } from "./PlaceSearch";
import { SeasonalLine, type CyclePoint } from "./SeasonalLine";
import { cached, prime } from "./exploreCache";
import {
  CLIMATE_LAYERS,
  COUNTRIES,
  MONTH_LABELS,
  POPULATION_MEASURES,
  densityBandsFor,
  formatCount,
  countryOf,
  OUTCOMES,
  bandsFor,
  children,
  formatPercent,
  lineage,
  monthLabel,
  monthsByYear,
  periodLength,
  periodsOfLength,
  scenarioTiers,
  seasonLabel,
  sspLabel,
  type ExploreLayer,
  type ExplorePlace,
} from "./exploreData";
import styles from "./explore.module.css";

/**
 * The public, map-first view of CHART. Everything here is a read of stored,
 * published estimates: opening a place, a month or a projection never
 * downloads or scores anything, so it needs no account.
 *
 * Each read is made once (exploreCache) and only when every choice it
 * depends on is known, so a view loads in one step instead of loading with
 * defaults and again with the real month or period. Shown values stay until
 * their replacement arrives, so the map and panel never blank.
 */

type State = {
  frame: string;
  selected: string | null;
  outcome: string;
  layer: ExploreLayer;
  month: string | null;
  period: string | null;
  scenario: string | null;
  /** Years per projection period: 5, 10 or 20. */
  length: number;
  /** Who the population layer counts. */
  people: PopulationMeasure;
};

const LAYERS: { code: ExploreLayer; label: string; hint: string }[] = [
  {
    code: "observed",
    label: "Observed heat share",
    hint: "Share of cases linked to heat in a past month, from ERA5 temperatures and the fitted health model.",
  },
  {
    code: "tmax",
    label: "Temperature",
    hint: "Monthly mean of the daily maximum air temperature, from Copernicus ERA5-Land at about 9 km. Context only: the health estimates use the data their models were fitted on.",
  },
  {
    code: "heat_days",
    label: "Heatwave days",
    hint: "India: days whose maximum reached 40 °C (IMD's threshold; its full heatwave definition also needs 4.5 °C above normal, which this count does not test). Kenya: days in runs of 3 or more at or above the county's KMD threshold (Nairobi 32 °C, Mombasa 36, Kisumu 37, Turkana, Marsabit and Mandera 38; 35 °C elsewhere). From ERA5-Land; context only.",
  },
  {
    code: "forecast",
    label: "Forecast heat share",
    hint: "The next six months from the Copernicus C3S multi-system seasonal forecast (nine centres): each place's ERA5 normal for the month plus the forecast anomaly, scored with the same models as the observed months. The range is the coolest and warmest forecast system.",
  },
  {
    code: "projection",
    label: "Projected heat share",
    hint: "Average share linked to heat in a future period under an emissions scenario.",
  },
  {
    code: "population",
    label: "Population",
    hint: "People per km², from WorldPop 2025 (1 km grid built from each census and UN-adjusted). Counts for each area are in the hover card and the panel.",
  },
  {
    code: "vulnerability",
    label: "Vulnerability",
    hint: "Vulnerability and resilience assessment index, 0 (least) to 1 (most vulnerable).",
  },
];

/** The design team's figure for each outcome's affected group. */
function exposedFigure(outcome: string): IconName {
  return outcome === "lbw" ? "newborn" : "child";
}

function outcomeNoun(outcome: string): string {
  return outcome === "lbw" ? "of low-birth-weight births" : "of under-five deaths";
}

/** Where each group of layers starts, so historical and projected read apart. */
const LAYER_GROUP_START: Partial<Record<ExploreLayer, string>> = {
  observed: "Historical · Copernicus ERA5 reanalysis",
  forecast: "Next 6 months · Copernicus C3S forecasts",
  projection: "Projections · climate models",
  population: "Context",
};

/** Names that depend on the country's own definition. */
function layerLabel(layer: ExploreLayer, country: string | undefined): string | null {
  if (layer === "heat_days" && country === "IN") return "Days ≥ 40 °C";
  return null;
}

function readState(): State {
  const params = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const layer = params.get("layer");
  return {
    frame: params.get("frame") ?? COUNTRIES[0].start,
    selected: params.get("place"),
    outcome: params.get("outcome") ?? "lbw",
    layer: LAYERS.some((item) => item.code === layer)
      ? (layer as ExploreLayer)
      : "observed",
    month: params.get("month"),
    period: params.get("period"),
    scenario: params.get("scenario"),
    length: Number(params.get("length")) || 20,
    people: (POPULATION_MEASURES.find((item) => item.code === params.get("people"))
      ?.code ?? "total") as PopulationMeasure,
  };
}

/**
 * Keep the URL in step. Moving to another place is a history entry, so the
 * browser's Back steps back up the drill-down; other choices replace the
 * current entry so Back is not filled with every month clicked.
 */
function writeState(state: State) {
  const params = new URLSearchParams();
  params.set("frame", state.frame);
  if (state.selected) params.set("place", state.selected);
  params.set("outcome", state.outcome);
  params.set("layer", state.layer);
  if (state.month) params.set("month", state.month);
  if (state.period) params.set("period", state.period);
  if (state.scenario) params.set("scenario", state.scenario);
  params.set("length", String(state.length));
  if (state.layer === "population") params.set("people", state.people);
  const next = `/explore?${params}`;
  if (`${window.location.pathname}${window.location.search}` === next) return;
  const current = new URLSearchParams(window.location.search);
  const moved =
    current.get("frame") !== state.frame ||
    (current.get("place") ?? null) !== state.selected;
  if (moved) window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

// One key per published read; see exploreCache.
const observedRead = (geo: string, outcome: string, month?: string | null) =>
  cached(`observed|${geo}|${outcome}|${month ?? ""}`, () =>
    fetchObservedRisk(geo, null, { outcome, month: month ?? undefined }),
  );
const outlookRead = (
  geo: string,
  outcome: string,
  period?: string | null,
  scenario?: string | null,
) =>
  cached(`outlook|${geo}|${outcome}|${period ?? ""}|${scenario ?? ""}`, () =>
    fetchHeatOutlook(geo, null, {
      outcome,
      period: period ?? undefined,
      scenario: scenario ?? undefined,
    }),
  );
const climateRead = (geo: string, layer: ClimateLayer, month?: string | null) =>
  cached(`climate|${geo}|${layer}|${month ?? ""}`, () =>
    fetchClimateLayer(geo, null, layer, month),
  );

const forecastMapRead = (geo: string, outcome: string, month?: string | null) =>
  cached(`forecast-map|${geo}|${outcome}|${month ?? ""}`, () =>
    fetchForecastMap(geo, outcome, month),
  );
const forecastRead = (geo: string, outcome: string) =>
  cached(`forecast|${geo}|${outcome}`, () => fetchForecast(geo, outcome));

const populationRead = (geo: string, measure: PopulationMeasure) =>
  cached(`population|${geo}|${measure}`, () => fetchPopulation(geo, measure));

/** The first of the frame and its children that has the read. */
async function firstAvailable<T>(ids: string[], read: (id: string) => Promise<T>) {
  for (const id of ids.slice(0, 5)) {
    try {
      return await read(id);
    } catch {
      // try the next place
    }
  }
  return null;
}

type FrameInfo = {
  key: string;
  outlook: HeatOutlook | null;
  months: string[];
  newest: string | null;
};

export function ExploreApp() {
  const [state, setState] = useState<State>(() => readState());
  const [places, setPlaces] = useState<ExplorePlace[]>([]);
  const [map, setMap] = useState<MapResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [frameInfo, setFrameInfo] = useState<FrameInfo | null>(null);
  const [climateInfo, setClimateInfo] = useState<{
    key: string;
    months: string[];
    newest: string | null;
  } | null>(null);
  const [focusData, setFocusData] = useState<{
    key: string;
    observed: ObservedRisk | null;
    outlook: HeatOutlook | null;
    baseline: HeatOutlook | null;
  } | null>(null);
  const [actions, setActions] = useState<RecommendedAction[]>([]);
  const [showActions, setShowActions] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [frameView, setFrameView] = useState<"selection" | "frame">("selection");

  const update = useCallback((patch: Partial<State>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => writeState(state), [state]);
  useEffect(() => {
    const restore = () => setState(readState());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    listGeographies()
      .then((rows) =>
        setPlaces(
          (rows as unknown as Record<string, string | null>[]).map((row) => ({
            id: row.id as string,
            name: row.name as string,
            path: row.path as string,
            countryCode: (row.countryCode as string) ?? "",
            level: (row.level as string) ?? "",
            levelLabel: (row.levelLabel as string) ?? "",
            parentId: row.parentId ?? null,
          })),
        ),
      )
      .catch(() => setPlaces([]));
    cached("actions", () => listRecommendedActions({ limit: 100 }))
      .then((items) =>
        setActions(
          [...items].sort((a, b) => Number(isHeatAction(b)) - Number(isHeatAction(a))),
        ),
      )
      .catch(() => setActions([]));
  }, []);

  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const frame = placeById.get(state.frame);
  const focusId = state.selected ?? state.frame;
  const focus = placeById.get(focusId);
  const trail = useMemo(() => lineage(places, focusId), [places, focusId]);
  const childIds = useMemo(
    () => children(places, state.frame).map((place) => place.id),
    [places, state.frame],
  );

  // What the frame offers: periods, scenarios and season (outlook), and the
  // observed months. The frame itself, or its first child with them.
  const frameKey = `${state.frame}|${state.outcome}`;
  useEffect(() => {
    let cancelled = false;
    const ids = [state.frame, ...childIds];
    Promise.all([
      firstAvailable(ids, (id) => outlookRead(id, state.outcome)),
      firstAvailable(ids, (id) => observedRead(id, state.outcome)),
    ]).then(([outlook, observed]) => {
      if (cancelled) return;
      setFrameInfo({
        key: frameKey,
        outlook,
        months: observed?.available_months ?? [],
        newest: observed?.month ?? observed?.available_months.at(-1) ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [frameKey, state.frame, state.outcome, childIds]);

  // Who lives in the frame's areas, for the panel whatever the layer.
  const [framePopulation, setFramePopulation] = useState<{
    key: string;
    data: PopulationMap;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    populationRead(state.frame, "total")
      .then((data) => !cancelled && setFramePopulation({ key: state.frame, data }))
      .catch(() => !cancelled && setFramePopulation(null));
    return () => {
      cancelled = true;
    };
  }, [state.frame]);

  // The forecast's months, from the frame's first forecast map.
  const forecastKey = `${state.frame}|${state.outcome}`;
  const [forecastInfo, setForecastInfo] = useState<{
    key: string;
    months: string[];
    issue: string | null;
  } | null>(null);
  useEffect(() => {
    if (state.layer !== "forecast") return;
    let cancelled = false;
    forecastMapRead(state.frame, state.outcome)
      .then((response) => {
        if (cancelled) return;
        if (response.month)
          prime(
            `forecast-map|${state.frame}|${state.outcome}|${response.month}`,
            response,
          );
        setForecastInfo({
          key: forecastKey,
          months: response.months,
          issue: response.issue,
        });
      })
      .catch(
        () =>
          !cancelled && setForecastInfo({ key: forecastKey, months: [], issue: null }),
      );
    return () => {
      cancelled = true;
    };
  }, [forecastKey, state.frame, state.outcome, state.layer]);
  const forecastMonths = forecastInfo?.key === forecastKey ? forecastInfo.months : [];
  const forecastMonth =
    state.month && forecastMonths.includes(state.month)
      ? state.month
      : (forecastMonths[0] ?? null);

  // The focused place's six months, for its panel.
  const [placeForecast, setPlaceForecast] = useState<{
    key: string;
    data: PlaceForecast | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = `${focusId}|${state.outcome}`;
    forecastRead(focusId, state.outcome)
      .then((data) => !cancelled && setPlaceForecast({ key, data }))
      .catch(() => !cancelled && setPlaceForecast({ key, data: null }));
    return () => {
      cancelled = true;
    };
  }, [focusId, state.outcome]);

  const climateView = CLIMATE_LAYERS.includes(state.layer);
  const climateKey = `${state.frame}|${state.layer}`;
  useEffect(() => {
    if (!climateView) return;
    let cancelled = false;
    const layer = state.layer as ClimateLayer;
    climateRead(state.frame, layer)
      .then((response) => {
        if (cancelled) return;
        // The newest month is the same read under its own name.
        if (response.month)
          prime(`climate|${state.frame}|${layer}|${response.month}`, response);
        setClimateInfo({
          key: climateKey,
          months: response.available_months,
          newest: response.month,
        });
      })
      .catch(
        () =>
          !cancelled && setClimateInfo({ key: climateKey, months: [], newest: null }),
      );
    return () => {
      cancelled = true;
    };
  }, [climateView, climateKey, state.frame, state.layer]);

  const frameReady = frameInfo?.key === frameKey;
  const outlookInfo = frameReady ? frameInfo.outlook : null;
  const observedMonths = frameReady ? frameInfo.months : [];
  const observedMonth =
    state.month && observedMonths.includes(state.month)
      ? state.month
      : frameReady
        ? frameInfo.newest
        : null;
  const climateReady = climateInfo?.key === climateKey;
  const climateMonths = climateReady ? climateInfo.months : [];
  // A month chosen on another layer carries over when this one holds it.
  const climateMonth =
    state.month && climateMonths.includes(state.month)
      ? state.month
      : observedMonth && climateMonths.includes(observedMonth)
        ? observedMonth
        : climateReady
          ? climateInfo.newest
          : null;
  const month = climateView ? climateMonth : observedMonth;

  const baselineCode =
    outlookInfo?.period_summary.find((row) => row.is_baseline)?.period ?? null;
  const lengths = [
    ...new Set(
      (outlookInfo?.periods ?? [])
        .filter((item) => item.code !== baselineCode)
        .map((item) => periodLength(item.code)),
    ),
  ].sort((a, b) => a - b);
  const periodChoices = periodsOfLength(
    (outlookInfo?.periods ?? []).map((item) => ({ ...item, period: item.code })),
    state.length,
    baselineCode,
  );
  const period =
    (state.period && periodChoices.some((item) => item.code === state.period)
      ? state.period
      : null) ??
    (outlookInfo && periodChoices.some((item) => item.code === outlookInfo.period)
      ? outlookInfo.period
      : (periodChoices.find((item) => item.code !== baselineCode)?.code ?? null));
  const scenario =
    (state.scenario &&
    outlookInfo?.scenarios.some((item) => item.code === state.scenario)
      ? state.scenario
      : null) ??
    outlookInfo?.scenario ??
    null;
  const tiers = scenarioTiers((outlookInfo?.scenarios ?? []).map((item) => item.code));

  // The map: one read, made once its month or period is known.
  const mapRead: { key: string; load: () => Promise<MapResponse> } | null = (() => {
    const { frame: geo, outcome, layer } = state;
    if (layer === "forecast") {
      if (!forecastMonth) return null;
      return {
        key: `forecast-map|${geo}|${outcome}|${forecastMonth}`,
        load: () => forecastMapRead(geo, outcome, forecastMonth),
      };
    }
    if (layer === "population")
      return {
        key: `population|${geo}|${state.people}`,
        load: () => populationRead(geo, state.people),
      };
    if (layer === "vulnerability")
      return { key: `vra|${geo}`, load: () => fetchVraMap(geo, null) };
    if (climateView) {
      if (!climateMonth) return null;
      return {
        key: `climate-map|${geo}|${layer}|${climateMonth}`,
        load: () => climateRead(geo, layer as ClimateLayer, climateMonth),
      };
    }
    if (!frameReady) return null;
    if (layer === "projection") {
      if (!period) return null;
      return {
        key: `outlook-map|${geo}|${outcome}|${period}|${scenario ?? ""}`,
        load: () =>
          fetchHeatOutlookMap(geo, null, {
            outcome,
            period,
            scenario: scenario ?? undefined,
          }),
      };
    }
    return {
      key: `observed-map|${geo}|${outcome}|${observedMonth ?? ""}`,
      load: () =>
        fetchObservedRiskMap(geo, null, { outcome, month: observedMonth ?? undefined }),
    };
  })();
  const mapKey = mapRead?.key ?? null;
  const mapReadRef = useRef(mapRead);
  mapReadRef.current = mapRead;

  useEffect(() => {
    const read = mapReadRef.current;
    if (!read) {
      setMapLoading(true);
      return;
    }
    let cancelled = false;
    setMapLoading(true);
    cached(read.key, read.load)
      .then((response) => {
        if (cancelled) return;
        setMap(response);
        setMapError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setMap(null);
        setMapError(
          state.layer === "vulnerability"
            ? "No vulnerability assessment is published for this area yet."
            : climateView
              ? "No ERA5-Land months are loaded for this area yet."
              : "No published estimates for this area and choice.",
        );
      })
      .finally(() => !cancelled && setMapLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mapKey, state.layer, climateView]);

  // The focused place: its month, seasonal cycle and change over periods.
  const focusKey = `${focusId}|${state.outcome}|${observedMonth ?? ""}|${period ?? ""}|${scenario ?? ""}`;
  const focusReady = frameReady;
  const loadFocus = useCallback(
    (id: string) => {
      const observed = observedMonth
        ? observedRead(id, state.outcome, observedMonth).catch(() =>
            observedRead(id, state.outcome),
          )
        : observedRead(id, state.outcome);
      return Promise.all([
        observed.catch(() => null),
        outlookRead(id, state.outcome, period, scenario).catch(() => null),
        baselineCode
          ? outlookRead(id, state.outcome, baselineCode, scenario).catch(() => null)
          : Promise.resolve(null),
      ]);
    },
    [state.outcome, observedMonth, period, scenario, baselineCode],
  );
  useEffect(() => {
    if (!focusReady) return;
    let cancelled = false;
    loadFocus(focusId).then(([observed, outlook, baseline]) => {
      if (!cancelled) setFocusData({ key: focusKey, observed, outlook, baseline });
    });
    return () => {
      cancelled = true;
    };
  }, [focusReady, focusKey, focusId, loadFocus]);

  // Hovering an area fetches its details, so the click that follows is instant.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetch = useCallback(
    (id: string | null) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (!id || !focusReady) return;
      hoverTimer.current = setTimeout(() => void loadFocus(id), 150);
    },
    [focusReady, loadFocus],
  );

  const observed = focusData?.observed ?? null;
  const outlook = focusData?.outlook ?? null;
  const focusStale = focusData?.key !== focusKey;
  const bands =
    state.layer === "population"
      ? densityBandsFor(state.people)
      : bandsFor(state.layer);
  const peopleCounts =
    framePopulation?.key === state.frame ? framePopulation.data : null;
  const focusPeople =
    peopleCounts?.counts[focusId] ??
    (focusId === state.frame ? peopleCounts?.place : null) ??
    null;
  const season = (outlook ?? outlookInfo)?.heat_season ?? null;
  const years = useMemo(
    () => monthsByYear(climateView ? climateMonths : observedMonths),
    [climateView, climateMonths, observedMonths],
  );
  const year = month?.slice(0, 4) ?? [...years.keys()].at(-1) ?? null;
  const focusArea = map?.areas.find((area) => area.geography_id === focusId);
  const planHref = dashboardHref({
    geographyId: state.frame,
    adminUnit: state.selected,
    outcome: state.outcome,
    choices: {
      view: state.layer === "projection" ? "projection" : "observed",
      month: observedMonth ?? undefined,
      period: period ?? undefined,
      scenario: scenario ?? undefined,
    },
  });
  const heatActions = actions.filter(isHeatAction);

  const open = (id: string) => {
    const hasChildren = children(places, id).length > 0;
    update(hasChildren ? { frame: id, selected: null } : { selected: id });
  };
  const pickPlace = (place: ExplorePlace) => {
    setFrameView("selection");
    update(
      place.parentId
        ? { frame: place.parentId, selected: place.id }
        : { frame: place.id, selected: null },
    );
  };

  return (
    <div className={styles.shell}>
      <IconSprite />
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          CHART
        </Link>
        <PlaceSearch places={places} frameId={state.frame} onPick={pickPlace} />
        <div className={styles.countries} role="group" aria-label="Country">
          {COUNTRIES.map((country) => (
            <button
              key={country.code}
              type="button"
              aria-pressed={countryOf(frame)?.code === country.code}
              onClick={() =>
                update({
                  frame: country.start,
                  selected: null,
                  month: null,
                  period: null,
                })
              }
            >
              {country.label}
            </button>
          ))}
        </div>
        <a
          href="/auth/signin"
          className={styles.signIn}
          onClick={() => rememberReturnPath(planHref)}
        >
          Sign in to plan
        </a>
      </header>

      <div className={styles.body}>
        <aside className={styles.panel} aria-label="Explore controls">
          <nav className={styles.trail} aria-label="Place">
            {trail.map((place, index) => (
              <button
                key={place.id}
                type="button"
                aria-current={index === trail.length - 1 ? "location" : undefined}
                onClick={() =>
                  index === trail.length - 1 && state.selected
                    ? undefined
                    : update({ frame: place.id, selected: null })
                }
              >
                {place.name}
              </button>
            ))}
          </nav>
          <p className={styles.level}>{focus?.levelLabel ?? ""}</p>
          <h1 className={styles.placeName}>{focus?.name ?? "Loading…"}</h1>
          {state.selected && children(places, state.selected).length > 0 && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => open(state.selected as string)}
            >
              Open its {children(places, state.selected)[0].levelLabel.toLowerCase()}s →
            </button>
          )}

          <section className={styles.section}>
            <h2>Health outcome</h2>
            <div className={styles.segmented} role="group" aria-label="Health outcome">
              {OUTCOMES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  aria-pressed={state.outcome === item.code}
                  onClick={() => update({ outcome: item.code })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2>Map layer</h2>
            <div role="radiogroup" aria-label="Map layer" className={styles.layers}>
              {LAYERS.map((item) => (
                <Fragment key={item.code}>
                  {LAYER_GROUP_START[item.code] && (
                    <p className={styles.layerGroup}>{LAYER_GROUP_START[item.code]}</p>
                  )}
                  <label className={styles.layer}>
                    <input
                      type="radio"
                      name="layer"
                      checked={state.layer === item.code}
                      onChange={() => update({ layer: item.code })}
                    />
                    <span>
                      {layerLabel(item.code, countryOf(frame)?.code) ?? item.label}
                    </span>
                    <span className={styles.layerValue}>
                      {item.code === "observed"
                        ? formatPercent(observed?.estimate?.value_percent)
                        : item.code === "forecast"
                          ? formatPercent(
                              placeForecast?.data?.months.find(
                                (row) =>
                                  row.month ===
                                  (forecastMonth ??
                                    placeForecast.data?.months[0]?.month),
                              )?.value_percent,
                            )
                          : item.code === "projection"
                            ? formatPercent(
                                outlook?.period_summary
                                  .find((row) => row.period === period)
                                  ?.parts.find((part) => part.side === "heat")
                                  ?.value_percent,
                              )
                            : item.code === state.layer &&
                                focusArea?.value_percent != null
                              ? item.code === "tmax"
                                ? `${focusArea.value_percent.toFixed(1)} °C`
                                : item.code === "heat_days"
                                  ? `${Math.round(focusArea.value_percent)} d`
                                  : item.code === "population"
                                    ? `${formatCount(focusArea.value_percent)}/km²`
                                    : (focusArea.value_percent / 100).toFixed(2)
                              : ""}
                    </span>
                  </label>
                </Fragment>
              ))}
            </div>
          </section>

          {(state.layer === "observed" || climateView) && years.size > 0 && (
            <section className={styles.section}>
              <h2>Month</h2>
              {years.size > 8 ? (
                <select
                  className={styles.yearSelect}
                  aria-label="Year"
                  value={year ?? ""}
                  onChange={(event) =>
                    update({
                      month: (years.get(event.target.value) ?? []).at(-1) ?? null,
                    })
                  }
                >
                  {[...years.keys()].reverse().map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={styles.chips} role="group" aria-label="Year">
                  {[...years.keys()].map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={item === year}
                      onClick={() =>
                        update({ month: (years.get(item) ?? []).at(-1) ?? null })
                      }
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.months} role="group" aria-label="Month">
                {MONTH_LABELS.map((label, index) => {
                  const key = `${year}-${String(index + 1).padStart(2, "0")}`;
                  const held = (years.get(year ?? "") ?? []).includes(key);
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={!held}
                      aria-pressed={month === key}
                      data-season={season?.months.includes(index + 1) || undefined}
                      onClick={() => update({ month: key })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {season && (
                <p className={styles.seasonNote}>
                  <span className={styles.seasonSwatch} /> {season.label}:{" "}
                  {seasonLabel(season.months)}, peak in{" "}
                  {MONTH_LABELS[season.peak_month - 1]} (
                  {season.source_uri ? (
                    <a href={season.source_uri} target="_blank" rel="noreferrer">
                      {season.source_name}
                    </a>
                  ) : (
                    season.source_name
                  )}
                  )
                </p>
              )}
            </section>
          )}

          {state.layer === "forecast" && forecastMonths.length > 0 && (
            <section className={styles.section}>
              <h2>Forecast month</h2>
              <div className={styles.months} role="group" aria-label="Forecast month">
                {forecastMonths.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={forecastMonth === key}
                    data-season={
                      season?.months.includes(Number(key.slice(5, 7))) || undefined
                    }
                    onClick={() => update({ month: key })}
                  >
                    {MONTH_LABELS[Number(key.slice(5, 7)) - 1]} {key.slice(2, 4)}
                  </button>
                ))}
              </div>
              <p className={styles.seasonNote}>
                Copernicus C3S forecast issued{" "}
                {forecastInfo?.issue ? monthLabel(forecastInfo.issue) : ""}; refreshed
                every month.
              </p>
            </section>
          )}

          {state.layer === "population" && (
            <section className={styles.section}>
              <h2>Who</h2>
              <div className={styles.segmented} role="group" aria-label="People">
                {POPULATION_MEASURES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    aria-pressed={state.people === item.code}
                    onClick={() => update({ people: item.code })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {state.layer === "projection" && outlookInfo && (
            <section className={styles.section}>
              {lengths.length > 1 && (
                <>
                  <h2>Period length</h2>
                  <div
                    className={styles.segmented}
                    role="group"
                    aria-label="Period length"
                  >
                    {lengths.map((years) => (
                      <button
                        key={years}
                        type="button"
                        aria-pressed={years === state.length}
                        onClick={() => update({ length: years, period: null })}
                      >
                        {years} years
                      </button>
                    ))}
                  </div>
                </>
              )}
              <h2>Future period</h2>
              <div className={styles.chips} role="group" aria-label="Period">
                {periodChoices.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    aria-pressed={item.code === period}
                    onClick={() => update({ period: item.code })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <h2>Emissions</h2>
              <div className={styles.scenarios} role="group" aria-label="Scenario">
                {outlookInfo.scenarios.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    aria-pressed={item.code === scenario}
                    title={item.label}
                    onClick={() => update({ scenario: item.code })}
                  >
                    {tiers.get(item.code)}
                    <small>{sspLabel(item.code)}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div aria-busy={focusStale} className={focusStale ? styles.stale : undefined}>
            <PlaceSummary
              observed={observed}
              outlook={outlook}
              baseline={focusData?.baseline ?? null}
              period={period}
              length={state.length}
              month={observedMonth}
              seasonMonths={season?.months ?? []}
              scenarioWord={scenario ? (tiers.get(scenario) ?? null) : null}
              scenarioCode={scenario}
              historical={state.layer !== "projection"}
              year={observedMonth?.slice(0, 4) ?? null}
            />
          </div>

          {placeForecast?.data &&
            placeForecast.key === `${focusId}|${state.outcome}` && (
              <section className={styles.section} data-testid="explore-forecast">
                <h2>
                  Next 6 months <span className={styles.muted}>· forecast</span>
                </h2>
                <ul className={styles.forecastList}>
                  {placeForecast.data.months.map((row) => {
                    const top = Math.max(
                      1,
                      ...placeForecast.data!.months.map(
                        (item) => item.high_percent ?? 0,
                      ),
                    );
                    return (
                      <li
                        key={row.month}
                        data-current={row.month === forecastMonth || undefined}
                      >
                        <span>{monthLabel(row.month)}</span>
                        <span
                          className={styles.forecastBar}
                          title="Range across forecast systems"
                        >
                          <i
                            className={styles.forecastRange}
                            style={{
                              left: `${((row.low_percent ?? 0) / top) * 100}%`,
                              width: `${(((row.high_percent ?? 0) - (row.low_percent ?? 0)) / top) * 100}%`,
                            }}
                          />
                          <i
                            className={styles.forecastPoint}
                            style={{
                              left: `${((row.value_percent ?? 0) / top) * 100}%`,
                            }}
                          />
                        </span>
                        <strong>{formatPercent(row.value_percent)}</strong>
                        <small>
                          {row.tmax_c !== null ? `${row.tmax_c.toFixed(1)}°` : ""}
                        </small>
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.muted}>
                  Share of {outcomeNoun(state.outcome).replace("of ", "")} linked to
                  heat in each coming month, with the range across{" "}
                  {placeForecast.data.systems.length} forecast systems, and the forecast
                  mean daily maximum.{" "}
                  <a
                    href={placeForecast.data.source_uri}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Copernicus C3S
                  </a>
                  , issued {monthLabel(placeForecast.data.issue)}.
                </p>
              </section>
            )}

          {focusPeople && peopleCounts && (
            <section className={styles.section} data-testid="explore-people">
              <h2>People ({peopleCounts.year})</h2>
              <dl className={styles.people}>
                <div>
                  <dt>Everyone</dt>
                  <dd>{focusPeople.total.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="child" size={14} /> Under five
                  </dt>
                  <dd>{focusPeople.under5.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="pregnant-woman" size={14} /> Women 15–49
                  </dt>
                  <dd>{focusPeople.women_15_49.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Per km²</dt>
                  <dd>
                    {focusPeople.area_km2
                      ? Math.round(
                          focusPeople.total / focusPeople.area_km2,
                        ).toLocaleString()
                      : "–"}
                  </dd>
                </div>
              </dl>
              <p className={styles.muted}>
                <a href={peopleCounts.source_uri} target="_blank" rel="noreferrer">
                  WorldPop
                </a>{" "}
                {peopleCounts.year} estimate from census data, 1 km grid summed over
                this area ({peopleCounts.license}).
              </p>
            </section>
          )}

          <section className={styles.section} data-testid="explore-act">
            <h2>Act on it</h2>
            <p className={styles.muted}>
              {heatActions.length} actions in the repository reduce heat risk. Pick the
              ones that fit {focus?.name ?? "this place"} and build a plan.
            </p>
            <div className={styles.actRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowActions(true)}
              >
                See actions
              </button>
              <a
                className={styles.planButton}
                href={planHref}
                onClick={() => rememberReturnPath(planHref)}
              >
                Plan for {focus?.name ?? "this place"} →
              </a>
            </div>
          </section>

          <p className={styles.footnote}>
            Estimates come from fitted temperature–health models applied to Copernicus
            ERA5 temperatures (observed) and downscaled climate projections. They show
            association, not proof of cause.
          </p>
        </aside>

        <main className={styles.mapArea}>
          {(state.selected || frame?.parentId) && (
            <button
              type="button"
              className={styles.upButton}
              onClick={() => {
                if (state.selected) return update({ selected: null });
                setFrameView("frame");
                update({ frame: frame?.parentId as string, selected: state.frame });
              }}
            >
              ↑{" "}
              {state.selected
                ? `All of ${frame?.name ?? ""}`
                : `Up to ${placeById.get(frame?.parentId ?? "")?.name ?? ""}`}
            </button>
          )}
          <ExploreMap
            data={map}
            layer={state.layer}
            bands={bands}
            selectedId={state.selected}
            loading={mapLoading}
            onSelect={(id) => update({ selected: id })}
            onOpen={open}
            onHover={prefetch}
            childLabel={(id) => {
              const below = children(places, id);
              return below.length ? `${below[0].levelLabel.toLowerCase()}s` : null;
            }}
            figure={
              state.layer === "observed" ||
              state.layer === "projection" ||
              state.layer === "forecast"
                ? exposedFigure(state.outcome)
                : null
            }
            note={
              state.layer === "forecast"
                ? (area) => {
                    const forecast = map as ForecastMap | null;
                    const range = forecast?.ranges?.[area.geography_id ?? ""];
                    const tmax = forecast?.tmax_c?.[area.geography_id ?? ""];
                    return [
                      range && range[0] !== null && range[1] !== null
                        ? `Range ${formatPercent(range[0])}–${formatPercent(range[1])} across systems`
                        : null,
                      tmax !== undefined
                        ? `Forecast mean daily max ${tmax.toFixed(1)} °C`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                  }
                : undefined
            }
            caption={
              state.layer === "forecast"
                ? `${outcomeNoun(state.outcome)} · ${forecastMonth ? monthLabel(forecastMonth) : ""} forecast`
                : state.layer === "observed"
                  ? `${outcomeNoun(state.outcome)} · ${month ? monthLabel(month) : ""}`
                  : state.layer === "projection"
                    ? `${outcomeNoun(state.outcome)} · ${outlookInfo?.periods.find((p) => p.code === period)?.label ?? ""}${scenario ? `, ${tiers.get(scenario)?.toLowerCase()} emissions` : ""}`
                    : null
            }
            people={(area) => {
              const found = peopleCounts?.counts[area.geography_id ?? ""];
              return found && peopleCounts
                ? { ...found, year: peopleCounts.year }
                : null;
            }}
            frameView={frameView}
          />
          {mapError && (
            <p className={styles.mapMessage} role="status">
              {mapError}
            </p>
          )}
          <div className={styles.legend} data-testid="explore-legend">
            <div className={styles.legendHead}>
              <strong>{LAYERS.find((item) => item.code === state.layer)?.label}</strong>
              <button type="button" onClick={() => setShowInfo((value) => !value)}>
                {showInfo ? "Hide info" : "See info"}
              </button>
            </div>
            {showInfo && (
              <p className={styles.legendInfo}>
                {LAYERS.find((item) => item.code === state.layer)?.hint}
              </p>
            )}
            <div className={styles.legendBands}>
              {bands.map((band) => (
                <span key={band.label}>
                  <i style={{ background: band.color }} />
                  {band.label}
                </span>
              ))}
            </div>
            {state.layer === "population" && peopleCounts && (
              <small className={styles.legendSource}>
                Source:{" "}
                <a href={peopleCounts.source_uri} target="_blank" rel="noreferrer">
                  WorldPop {peopleCounts.year}
                </a>{" "}
                ({peopleCounts.license}), 1 km grid summed per area
              </small>
            )}
            <small>
              {(state.layer === "observed" || climateView) && month
                ? monthLabel(month)
                : ""}
              {climateView ? " · Copernicus ERA5-Land" : ""}
              {state.layer === "forecast" && forecastMonth
                ? `${monthLabel(forecastMonth)} · Copernicus C3S forecast`
                : ""}
              {state.layer === "projection" && period
                ? `${outlookInfo?.periods.find((p) => p.code === period)?.label ?? period}${scenario ? ` · ${tiers.get(scenario)} emissions (${sspLabel(scenario)})` : ""}`
                : ""}
            </small>
          </div>
          {showActions && (
            <ActionsDrawer
              actions={actions}
              placeName={focus?.name ?? "this place"}
              planHref={planHref}
              onClose={() => setShowActions(false)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function PlaceSummary({
  observed,
  outlook,
  baseline,
  period,
  length,
  month,
  seasonMonths,
  scenarioWord,
  scenarioCode,
  historical,
  year,
}: {
  observed: ObservedRisk | null;
  outlook: HeatOutlook | null;
  baseline: HeatOutlook | null;
  period: string | null;
  length: number;
  month: string | null;
  seasonMonths: number[];
  scenarioWord: string | null;
  scenarioCode: string | null;
  /** Show the selected year's observed months rather than a projected period. */
  historical: boolean;
  year: string | null;
}) {
  const heat = (parts: { side: string; value_percent: number | null }[]) =>
    parts.find((part) => part.side === "heat")?.value_percent ?? null;
  const cycle = (source: HeatOutlook | null): CyclePoint[] =>
    (source?.months ?? []).map((item) => ({
      month: item.month,
      value: heat(item.parts),
      tmax: item.tmax_c,
    }));
  const baselineCode =
    outlook?.period_summary.find((row) => row.is_baseline)?.period ?? null;
  const periods = periodsOfLength(outlook?.period_summary ?? [], length, baselineCode);
  const periodPeak = Math.max(1, ...periods.map((row) => heat(row.parts) ?? 0));
  const periodName = (code: string | null | undefined) =>
    outlook?.periods.find((p) => p.code === code)?.label ?? code ?? "";

  // The observed months of the selected year, and every year's average. A
  // scored month without a share had no heat excess (the guides suppress a
  // negative share), so it counts as 0, not as missing.
  const history = (observed?.history ?? []).map((row) => ({
    ...row,
    value_percent: row.value_percent ?? 0,
  }));
  const byMonth = (rows: typeof history, month: number) =>
    rows.filter((row) => Number(row.month.slice(5, 7)) === month);
  const average = (values: (number | null)[]) => {
    const held = values.filter((value): value is number => value !== null);
    return held.length ? held.reduce((a, b) => a + b, 0) / held.length : null;
  };
  const inYear = history.filter((row) => row.month.startsWith(`${year}-`));
  const yearCycle: CyclePoint[] | null =
    year && inYear.length
      ? Array.from({ length: 12 }, (_, index) => ({
          month: index + 1,
          value: average(byMonth(inYear, index + 1).map((row) => row.value_percent)),
          tmax: null,
        }))
      : null;
  const allYears: CyclePoint[] | null = history.length
    ? Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        value: average(byMonth(history, index + 1).map((row) => row.value_percent)),
        tmax: null,
      }))
    : null;
  const yearAverage = average(inYear.map((row) => row.value_percent));
  const allYearsAverage = average(history.map((row) => row.value_percent));
  const firstYear = history[0]?.month.slice(0, 4);
  const lastYear = history.at(-1)?.month.slice(0, 4);

  if (!observed && !outlook) {
    return (
      <section className={styles.section}>
        <p className={styles.muted}>
          No published estimate for this place and outcome. Choose an area on the map.
        </p>
      </section>
    );
  }
  return (
    <>
      {observed?.estimate && (
        <section className={styles.section} data-testid="explore-estimate">
          <h2>
            {month ? `Observed · ${monthLabel(observed.month ?? month)}` : "Observed"}
          </h2>
          <p className={styles.bigNumber}>
            {observed.estimate.value_percent === null
              ? "No heat excess"
              : formatPercent(observed.estimate.value_percent)}
          </p>
          <p className={styles.muted}>
            {observed.estimate.value_percent === null
              ? (observed.estimate.message ?? "")
              : "of cases in this month linked to heat"}
            {observed.estimate.ratio
              ? ` · ${observed.estimate.ratio.kind === "odds_ratio" ? "odds" : "risk"} ratio ${observed.estimate.ratio.value.toFixed(2)}`
              : ""}
          </p>
        </section>
      )}

      {historical && yearCycle && (
        <section className={styles.section} data-testid="explore-seasonal-cycle">
          <h2>
            Seasonal cycle, {year} <span className={styles.muted}>· observed</span>
          </h2>
          <SeasonalLine
            current={yearCycle}
            baseline={allYears}
            currentLabel={year ?? ""}
            baselineLabel={`Average ${firstYear}–${lastYear}`}
            seasonMonths={seasonMonths}
          />
          <p className={styles.muted} data-testid="explore-year-average">
            Year average: {formatPercent(yearAverage)} of cases linked to heat
            {allYearsAverage !== null
              ? ` (average year ${formatPercent(allYearsAverage)})`
              : ""}
            . Months with no heat excess count as 0%.
          </p>
        </section>
      )}

      {!(historical && yearCycle) && outlook && outlook.months.length === 12 && (
        <section className={styles.section} data-testid="explore-seasonal-cycle">
          <h2>Seasonal cycle</h2>
          <SeasonalLine
            current={cycle(outlook)}
            baseline={
              baseline && baseline.period !== outlook.period ? cycle(baseline) : null
            }
            currentLabel={periodName(outlook.period)}
            baselineLabel={
              baseline && baseline.period !== outlook.period
                ? periodName(baseline.period)
                : null
            }
            seasonMonths={seasonMonths}
          />
        </section>
      )}

      {periods.length > 1 && (
        <section className={styles.section} data-testid="explore-projection">
          <h2>How it changes</h2>
          <ul className={styles.periods}>
            {periods.map((row) => {
              const value = heat(row.parts);
              return (
                <li key={row.period} data-current={row.period === period || undefined}>
                  <span>{row.label}</span>
                  <span className={styles.periodBar}>
                    <i style={{ width: `${((value ?? 0) / periodPeak) * 100}%` }} />
                  </span>
                  <strong>{formatPercent(value)}</strong>
                </li>
              );
            })}
          </ul>
          <p className={styles.muted}>
            Average year in each {length}-year period
            {scenarioWord && scenarioCode
              ? `, ${scenarioWord.toLowerCase()} emissions (${sspLabel(scenarioCode)})`
              : ""}
            .
          </p>
        </section>
      )}
    </>
  );
}
