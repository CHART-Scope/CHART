"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MapResponse } from "@/lib/dashboardClient";
import {
  fetchClimateLayer,
  fetchHeatOutlook,
  fetchHeatOutlookMap,
  fetchObservedRisk,
  fetchObservedRiskMap,
  type HeatOutlook,
  type ObservedRisk,
} from "@/lib/heatOutlookClient";
import { listGeographies } from "@/lib/planningClient";
import { fetchVraMap } from "@/lib/vraClient";

import { ExploreMap } from "./ExploreMap";
import {
  CLIMATE_LAYERS,
  COUNTRIES,
  MONTH_LABELS,
  OUTCOMES,
  bandsFor,
  children,
  formatPercent,
  lineage,
  monthLabel,
  monthsByYear,
  periodLength,
  periodsOfLength,
  seasonLabel,
  type ExploreLayer,
  type ExplorePlace,
} from "./exploreData";
import styles from "./explore.module.css";

/**
 * The public, map-first view of CHART. Everything here is a read of stored,
 * published estimates: opening a place, a month or a projection never
 * downloads or scores anything, so it needs no account.
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
};

const LAYERS: { code: ExploreLayer; label: string; hint: string }[] = [
  {
    code: "observed",
    label: "Observed heat share",
    hint: "Share of cases linked to heat in a past month, from ERA5 temperatures and the fitted health model.",
  },
  {
    code: "projection",
    label: "Projected heat share",
    hint: "Average share linked to heat in a future period under a climate scenario.",
  },
  {
    code: "tmax",
    label: "Temperature",
    hint: "Monthly mean of the daily maximum air temperature, from Copernicus ERA5-Land at about 9 km. Context only: the health estimates use the data their models were fitted on.",
  },
  {
    code: "heat_days",
    label: "Heatwave days",
    hint: "Days in the month in a heatwave at the country's official threshold (IMD: 40 °C; KMD: 32–38 °C by county over 3+ days), from ERA5-Land. Context only.",
  },
  {
    code: "vulnerability",
    label: "Vulnerability",
    hint: "Vulnerability and resilience assessment index, 0 (least) to 1 (most vulnerable).",
  },
];

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
  };
}

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
  window.history.replaceState(null, "", `/explore?${params}`);
}

export function ExploreApp() {
  const [state, setState] = useState<State>(() => readState());
  const [places, setPlaces] = useState<ExplorePlace[]>([]);
  const [map, setMap] = useState<MapResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [frameOutlook, setFrameOutlook] = useState<HeatOutlook | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [climateMonths, setClimateMonths] = useState<string[]>([]);
  const [observed, setObserved] = useState<ObservedRisk | null>(null);
  const [outlook, setOutlook] = useState<HeatOutlook | null>(null);
  const [query, setQuery] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  const update = useCallback((patch: Partial<State>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => writeState(state), [state]);

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
  }, []);

  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const frame = placeById.get(state.frame);
  const focusId = state.selected ?? state.frame;
  const focus = placeById.get(focusId);
  const trail = useMemo(() => lineage(places, focusId), [places, focusId]);

  // The frame's outlook gives the periods, scenarios and heat season; the
  // first child with one stands in when the frame itself has none.
  useEffect(() => {
    let cancelled = false;
    const candidates = [state.frame, ...children(places, state.frame).map((p) => p.id)];
    (async () => {
      for (const id of candidates.slice(0, 5)) {
        try {
          const found = await fetchHeatOutlook(id, null, {
            outcome: state.outcome,
            scenario: state.scenario ?? undefined,
            period: state.period ?? undefined,
          });
          if (!cancelled) setFrameOutlook(found);
          return;
        } catch {
          // try the next place
        }
      }
      if (!cancelled) setFrameOutlook(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.frame, state.outcome, state.period, state.scenario, places]);

  // Months held for the frame (or, failing that, its first scored child).
  useEffect(() => {
    let cancelled = false;
    const candidates = [state.frame, ...children(places, state.frame).map((p) => p.id)];
    (async () => {
      for (const id of candidates.slice(0, 5)) {
        try {
          const found = await fetchObservedRisk(id, null, { outcome: state.outcome });
          if (cancelled) return;
          setMonths(found.available_months);
          if (!state.month || !found.available_months.includes(state.month)) {
            update({ month: found.month ?? found.available_months.at(-1) ?? null });
          }
          return;
        } catch {
          // try the next place
        }
      }
      if (!cancelled) setMonths([]);
    })();
    return () => {
      cancelled = true;
    };
    // state.month is read, not depended on: a month change keeps the list.
  }, [state.frame, state.outcome, places, update]);

  const baselineCode =
    frameOutlook?.period_summary.find((row) => row.is_baseline)?.period ?? null;
  const lengths = [
    ...new Set(
      (frameOutlook?.periods ?? [])
        .filter((item) => item.code !== baselineCode)
        .map((item) => periodLength(item.code)),
    ),
  ].sort((a, b) => a - b);
  const periodChoices = periodsOfLength(
    (frameOutlook?.periods ?? []).map((item) => ({ ...item, period: item.code })),
    state.length,
    baselineCode,
  );
  const period =
    state.period ??
    (frameOutlook && periodChoices.some((item) => item.code === frameOutlook.period)
      ? frameOutlook.period
      : (periodChoices.find((item) => item.code !== baselineCode)?.code ?? null));
  const scenario = state.scenario ?? frameOutlook?.scenario ?? null;

  useEffect(() => {
    let cancelled = false;
    setMapLoading(true);
    setMapError(null);
    const climate = CLIMATE_LAYERS.includes(state.layer);
    const load = climate
      ? // Ask for the chosen month while this layer's months are unknown (a
        // shared link); a month it does not hold falls back to its newest.
        fetchClimateLayer(
          state.frame,
          null,
          state.layer as "tmax" | "heat_days",
          !climateMonths.length || climateMonths.includes(state.month ?? "")
            ? state.month
            : null,
        )
          .catch(() =>
            fetchClimateLayer(state.frame, null, state.layer as "tmax" | "heat_days"),
          )
          .then((response) => {
            if (!cancelled) {
              setClimateMonths(response.available_months);
              if (response.month && response.month !== state.month)
                update({ month: response.month });
            }
            return response;
          })
      : state.layer === "vulnerability"
        ? fetchVraMap(state.frame, null)
        : state.layer === "projection"
          ? fetchHeatOutlookMap(state.frame, null, {
              outcome: state.outcome,
              period: period ?? undefined,
              scenario: scenario ?? undefined,
            })
          : fetchObservedRiskMap(state.frame, null, {
              outcome: state.outcome,
              month: state.month ?? undefined,
            });
    load
      .then((response) => {
        if (!cancelled) setMap(response);
      })
      .catch(() => {
        if (!cancelled) {
          setMap(null);
          setMapError(
            state.layer === "vulnerability"
              ? "No vulnerability assessment is published for this area yet."
              : CLIMATE_LAYERS.includes(state.layer)
                ? "No ERA5-Land months are loaded for this area yet."
                : "No published estimates for this area and choice.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // climateMonths is read to validate the month, not to refetch.
  }, [state.frame, state.layer, state.outcome, state.month, period, scenario, update]);

  // The focused place's own estimate, seasonal cycle and projected change.
  useEffect(() => {
    let cancelled = false;
    setObserved(null);
    setOutlook(null);
    fetchObservedRisk(focusId, null, {
      outcome: state.outcome,
      month: state.month ?? undefined,
    })
      .then((found) => !cancelled && setObserved(found))
      .catch(() => !cancelled && setObserved(null));
    fetchHeatOutlook(focusId, null, {
      outcome: state.outcome,
      period: period ?? undefined,
      scenario: scenario ?? undefined,
    })
      .then((found) => !cancelled && setOutlook(found))
      .catch(() => !cancelled && setOutlook(null));
    return () => {
      cancelled = true;
    };
  }, [focusId, state.outcome, state.month, period, scenario]);

  const bands = bandsFor(state.layer);
  const season = (outlook ?? frameOutlook)?.heat_season ?? null;
  const climateView = CLIMATE_LAYERS.includes(state.layer);
  const shownMonths = climateView ? climateMonths : months;
  const years = useMemo(() => monthsByYear(shownMonths), [shownMonths]);
  const focusArea = map?.areas.find((area) => area.geography_id === focusId);
  const year = state.month?.slice(0, 4) ?? [...years.keys()].at(-1) ?? null;
  const matches = query.trim()
    ? places
        .filter((place) =>
          place.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  const open = (id: string) => {
    const hasChildren = children(places, id).length > 0;
    update(hasChildren ? { frame: id, selected: null } : { selected: id });
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          CHART
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <span className={styles.navActive} aria-current="page">
            Explore
          </span>
          <Link href="/learning">Learning hub</Link>
        </nav>
        <div className={styles.search}>
          <input
            type="search"
            placeholder="Search a district, county or constituency"
            aria-label="Search places"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {matches.length > 0 && (
            <ul className={styles.searchResults} role="listbox">
              {matches.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      const parent = place.parentId ?? place.id;
                      update(
                        children(places, place.id).length > 0
                          ? { frame: place.id, selected: null }
                          : { frame: parent, selected: place.id },
                      );
                    }}
                  >
                    {place.name}
                    <small>{place.levelLabel}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.countries} role="group" aria-label="Country">
          {COUNTRIES.map((country) => (
            <button
              key={country.code}
              type="button"
              aria-pressed={frame?.countryCode === country.code}
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
        <Link href="/auth/signin" className={styles.signIn}>
          Sign in to plan
        </Link>
      </header>

      <div className={styles.body}>
        <aside className={styles.panel} aria-label="Explore controls">
          <nav className={styles.trail} aria-label="Place">
            {trail.map((place, index) => (
              <button
                key={place.id}
                type="button"
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
                <label key={item.code} className={styles.layer}>
                  <input
                    type="radio"
                    name="layer"
                    checked={state.layer === item.code}
                    onChange={() => update({ layer: item.code })}
                  />
                  <span>{item.label}</span>
                  <span className={styles.layerValue}>
                    {item.code === "observed"
                      ? formatPercent(observed?.estimate?.value_percent)
                      : item.code === "projection"
                        ? formatPercent(
                            outlook?.period_summary
                              .find((row) => row.period === period)
                              ?.parts.find((part) => part.side === "heat")
                              ?.value_percent,
                          )
                        : ""}
                  </span>
                </label>
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
                  const inSeason = season?.months.includes(index + 1);
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={!held}
                      aria-pressed={state.month === key}
                      data-season={inSeason || undefined}
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
                  {MONTH_LABELS[season.peak_month - 1]} ({season.source_name})
                </p>
              )}
            </section>
          )}

          {state.layer === "projection" && frameOutlook && (
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
              <h2>Emissions scenario</h2>
              <div className={styles.segmented} role="group" aria-label="Scenario">
                {frameOutlook.scenarios.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    aria-pressed={item.code === scenario}
                    onClick={() => update({ scenario: item.code })}
                  >
                    {item.label.replace(/ \(.*\)/, "")}
                  </button>
                ))}
              </div>
            </section>
          )}

          <PlaceSummary
            observed={observed}
            outlook={outlook}
            period={period}
            length={state.length}
            month={state.month}
            seasonMonths={season?.months ?? []}
          />

          <p className={styles.footnote}>
            Estimates come from fitted temperature–health models applied to Copernicus
            ERA5 temperatures (observed) and downscaled climate projections. They show
            association, not proof of cause.{" "}
            <Link href="/learning">How CHART works</Link>
          </p>
        </aside>

        <main className={styles.mapArea}>
          <ExploreMap
            data={map}
            layer={state.layer}
            bands={bands}
            selectedId={state.selected}
            loading={mapLoading}
            onSelect={(id) => update({ selected: id })}
            onOpen={open}
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
            <small>
              {(state.layer === "observed" || climateView) && state.month
                ? monthLabel(state.month)
                : ""}
              {climateView ? " · Copernicus ERA5-Land" : ""}
              {state.layer === "projection" && period
                ? `${frameOutlook?.periods.find((p) => p.code === period)?.label ?? period}`
                : ""}
            </small>
          </div>
        </main>
      </div>
    </div>
  );
}

function PlaceSummary({
  observed,
  outlook,
  period,
  length,
  month,
  seasonMonths,
}: {
  observed: ObservedRisk | null;
  outlook: HeatOutlook | null;
  period: string | null;
  length: number;
  month: string | null;
  seasonMonths: number[];
}) {
  const heat = (parts: { side: string; value_percent: number | null }[]) =>
    parts.find((part) => part.side === "heat")?.value_percent ?? null;
  const cycle = outlook?.months ?? [];
  const peak = Math.max(1, ...cycle.map((item) => heat(item.parts) ?? 0));
  const periods = periodsOfLength(
    outlook?.period_summary ?? [],
    length,
    outlook?.period_summary.find((row) => row.is_baseline)?.period ?? null,
  );
  const periodPeak = Math.max(1, ...periods.map((row) => heat(row.parts) ?? 0));

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
          <h2>{month ? `Observed · ${monthLabel(month)}` : "Observed"}</h2>
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

      {cycle.length === 12 && (
        <section className={styles.section} data-testid="explore-seasonal-cycle">
          <h2>Seasonal cycle</h2>
          <div className={styles.cycle} aria-label="Typical share by month">
            {cycle.map((item) => {
              const value = heat(item.parts);
              return (
                <div
                  key={item.month}
                  className={styles.cycleBar}
                  data-season={seasonMonths.includes(item.month) || undefined}
                  title={`${MONTH_LABELS[item.month - 1]}: ${formatPercent(value)}${item.tmax_c !== null ? `, ${item.tmax_c.toFixed(1)} °C` : ""}`}
                >
                  <span
                    style={{ height: `${Math.max(4, ((value ?? 0) / peak) * 100)}%` }}
                  />
                  <small>{MONTH_LABELS[item.month - 1][0]}</small>
                </div>
              );
            })}
          </div>
          <p className={styles.muted}>
            Typical month in{" "}
            {outlook?.periods.find((p) => p.code === outlook.period)?.label}. Shaded
            months are the official heat season.
          </p>
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
            Average year in each period,{" "}
            {outlook?.scenarios.find((s) => s.code === outlook.scenario)?.label}.
          </p>
        </section>
      )}
    </>
  );
}
