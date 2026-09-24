"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/Skeleton";
import { fetchRiskMap, type MapArea, type MapResponse } from "@/lib/dashboardClient";
import { submitPrediction } from "@/lib/planningClient";

import styles from "./SpatialRiskMap.module.css";

/**
 * Where the risk sits, drawn as administrative areas.
 *
 * Hand-rolled SVG rather than a mapping library: the shapes arrive as GeoJSON
 * already simplified by the server, the projection needed is a local equirectangular
 * fit to a bounding box, and that is the whole job. A tile layer would add a
 * dependency, a basemap licence and a network call for no gain.
 *
 * Two rules the drawing must keep:
 *
 * - An area with no fitted model, or no computed month, is always drawn -
 *   never omitted. Leaving it out redraws the country as though the gap were
 *   sea, which tells the reader those places are fine. The two absences get
 *   different patterns because they need different things from the reader:
 *   "not run yet" is a selection away, "not integrated" needs a fitted model.
 * - These are area-level values on administrative shapes. They are not a
 *   modelled grid and must not be rendered as cells, which would imply a
 *   spatial resolution the model does not have.
 */

type Props = {
  embedded?: boolean;
  dataRefreshKey?: number;
  geographyId: string;
  accessToken?: string;
  month?: string | null;
  outcome?: string;
  /** Highlighted area, as an AppGeography id. */
  selectedGeographyId?: string | null;
  onSelect?: (geographyId: string) => void;
  /** Whether this user may queue a run for an area that has none. */
  canPrepare?: boolean;
};

// Dashboard query-string changes can remount this component even when the map
// scope has not changed (for example, selecting another county). Keep the
// expensive, parent-level map response outside the component so those
// navigations reuse it. The token remains part of the key so data is never
// shared between signed-in sessions; the small bound prevents an old session
// from accumulating indefinitely in a long-lived tab.
const mapCache = new Map<string, MapResponse>();
const mapRequests = new Map<string, Promise<MapResponse>>();
const MAX_CACHED_MAPS = 12;

function rememberMap(key: string, data: MapResponse) {
  mapCache.delete(key);
  mapCache.set(key, data);
  while (mapCache.size > MAX_CACHED_MAPS) {
    const oldest = mapCache.keys().next().value;
    if (oldest === undefined) break;
    mapCache.delete(oldest);
  }
}

function loadMap(
  key: string,
  geographyId: string,
  accessToken: string,
  month: string | null | undefined,
  outcome: string | undefined,
  force: boolean,
): Promise<MapResponse> {
  if (!force) {
    const cached = mapCache.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = mapRequests.get(key);
    if (pending) return pending;
  }

  const request = fetchRiskMap(geographyId, accessToken, { month, outcome })
    .then((response) => {
      rememberMap(key, response);
      return response;
    })
    .finally(() => {
      if (mapRequests.get(key) === request) mapRequests.delete(key);
    });
  mapRequests.set(key, request);
  return request;
}

export function SpatialRiskMap({
  embedded = false,
  dataRefreshKey = 0,
  geographyId,
  accessToken,
  month,
  outcome,
  selectedGeographyId,
  onSelect,
  canPrepare = false,
}: Props) {
  const id = useId();
  const [result, setResult] = useState<{ key: string; data: MapResponse } | null>(null);
  const requestKey = `${geographyId}:${outcome}:${month}:${accessToken}`;
  const data = result?.key === requestKey ? result.data : null;
  const [activeBand, setActiveBand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Position travels with the hovered area so the tooltip can sit beside the
  // cursor. The browser's own <title> tooltip is unstyled, slow to appear and
  // cannot show a second line, which is most of what there is to say here.
  const [hovered, setHovered] = useState<{
    area: MapArea;
    x: number;
    y: number;
  } | null>(null);
  const [preparing, setPreparing] = useState(0);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  // Areas this browser session has already queued. Without it a failed run
  // would return to "not calculated", be picked up again on the next render,
  // and loop - queueing the same area forever.
  const queued = useRef<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!geographyId || !accessToken) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setError(null);
    setHovered(null);
    loadMap(
      requestKey,
      geographyId,
      accessToken,
      month,
      outcome,
      refreshKey > 0 || dataRefreshKey > 0,
    )
      .then((response) => {
        if (!cancelled) setResult({ key: requestKey, data: response });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "The map could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    geographyId,
    accessToken,
    month,
    outcome,
    refreshKey,
    requestKey,
    dataRefreshKey,
  ]);

  useEffect(() => {
    if (!data?.areas.some((area) => area.missing_reason === "running")) return;
    const timer = setTimeout(() => setRefreshKey((value) => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    queued.current = new Set();
  }, [geographyId, month, outcome]);

  /** Areas that could be run now: modelled, not already running, no value.
   *
   * The selected area comes first. The map frames a leaf selection on its
   * siblings, so the list holds places the reader did not ask about, and the
   * visit's small allowance would otherwise be spent in map order - on other
   * divisions - while the one actually on screen stayed blank.
   */
  const runnable = useMemo(
    () =>
      (data?.areas ?? [])
        .filter(
          (area) =>
            area.value_percent === null &&
            area.missing_reason === "no_prediction" &&
            area.geography_id != null &&
            !queued.current.has(area.geography_id),
        )
        .sort((left, right) => {
          const leftSelected = left.geography_id === selectedGeographyId;
          const rightSelected = right.geography_id === selectedGeographyId;
          return Number(rightSelected) - Number(leftSelected);
        }),
    [data, selectedGeographyId],
  );

  const prepare = useCallback(
    async (areas: MapArea[]) => {
      if (!accessToken || !month || areas.length === 0) return;
      setPreparing(areas.length);
      setPrepareError(null);
      for (const area of areas) {
        if (!area.geography_id) continue;
        queued.current.add(area.geography_id);
        try {
          await submitPrediction(accessToken, {
            geographyId: area.geography_id,
            planningMonth: month,
            target: "month",
            outcome,
          });
        } catch {
          queued.current.delete(area.geography_id);
          setPrepareError("Some areas could not be queued. You can try again.");
        }
      }
      setPreparing(0);
      // Pick up the queued rows so they switch to "loading data". Safe to
      // re-run the effect: the counter above has already spent this visit's
      // automatic allowance, so the refetch cannot start another batch.
      setRefreshKey((value) => value + 1);
    },
    [accessToken, month, outcome],
  );

  const shapes = useMemo(() => {
    if (!data) return [];
    // Older map responses include the frame's outline alongside its children.
    // A country/state fill must not obscure its county/division values.
    const areas = data.areas.filter(
      (area) =>
        area.geography_id !== geographyId ||
        !data.areas.some((other) => other.level !== area.level),
    );
    return projectAreas({ ...data, areas });
  }, [data, geographyId]);
  const shaded = shapes.filter((shape) => shape.area.value_percent !== null);
  const highest = shaded.reduce(
    (peak, shape) =>
      (shape.area.value_percent ?? 0) > (peak?.area.value_percent ?? -1) ? shape : peak,
    null as ProjectedArea | null,
  );

  if (error) {
    return (
      <section
        className={embedded ? styles.embedded : styles.panel}
        aria-labelledby={`${id}-heading`}
      >
        {!embedded && <p className={styles.eyebrow}>Where the risk sits</p>}
        <h2 id={`${id}-heading`}>Risk across areas · area-level estimates</h2>
        <p className={styles.notice} role="alert">
          {error}
        </p>
        <button
          type="button"
          className={styles.prepareAll}
          onClick={() => {
            setError(null);
            setRefreshKey((value) => value + 1);
          }}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <section
      className={embedded ? styles.embedded : styles.panel}
      aria-labelledby={`${id}-heading`}
    >
      {!embedded && <p className={styles.eyebrow}>Where the risk sits</p>}
      <h2 id={`${id}-heading`}>Risk across areas · area-level estimates</h2>

      {shapes.length === 0 ? (
        data ? (
          <p className={styles.notice} role="status">
            No areas have boundaries to draw yet.
          </p>
        ) : (
          /* A placeholder shaped like the map, not a line of text. The card
             already has its heading by this point, so a "Loading the map…"
             sentence underneath read as a second, competing loader beside the
             page-level skeleton. */
          <div
            className={styles.loading}
            role="status"
            aria-label="Loading the risk map"
          >
            <Skeleton width="100%" height="16rem" radius="md" />
            <div className={styles.loadingLegend} aria-hidden="true">
              <Skeleton width="2rem" height="0.75rem" />
              <Skeleton width="6rem" height="0.5rem" radius="full" />
              <Skeleton width="2.5rem" height="0.75rem" />
            </div>
          </div>
        )
      ) : (
        <>
          <div className={styles.mapWrap}>
            <svg
              className={styles.map}
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              role="group"
              aria-label={describe(shapes, highest)}
            >
              <defs>
                {/* Two different absences, drawn differently. "Not run yet" is
                  a button press away; "no fitted model" needs a modeller. A
                  single grey for both hides a distinction a planner acts on. */}
                <pattern
                  id={`${id}-pending`}
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="5" height="5" fill="var(--surface-muted, #f4f3ee)" />
                  <circle cx="1" cy="1" r="0.7" fill="var(--border-muted, #cfcabb)" />
                </pattern>
                {/* Work already in flight: a soft pulse, so a planner can see
                  the difference between "on its way" and "nobody asked". */}
                <pattern
                  id={`${id}-running`}
                  width="7"
                  height="7"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="7" height="7" fill="var(--surface-muted, #f4f3ee)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="7"
                    stroke="var(--color-forest, #2f6f4e)"
                    strokeWidth="1.4"
                    opacity="0.45"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.2;0.6;0.2"
                      dur="1.8s"
                      repeatCount="indefinite"
                    />
                  </line>
                </pattern>
                <pattern
                  id={`${id}-unmodelled`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="6" height="6" fill="var(--surface-muted, #efeee8)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="var(--color-slate, #9a958a)"
                    strokeWidth="1.8"
                  />
                </pattern>
              </defs>
              {shapes.map((shape) => {
                const selected =
                  selectedGeographyId != null &&
                  shape.area.geography_id === selectedGeographyId;
                return (
                  <path
                    key={shape.area.admin_unit_id}
                    d={shape.path}
                    fillRule="evenodd"
                    className={styles.area}
                    data-selected={selected || undefined}
                    data-muted={
                      (activeBand !== null &&
                        activeBand !==
                          (shape.area.value_percent === null
                            ? "Unavailable"
                            : bandFor(shape.area.value_percent).label)) ||
                      undefined
                    }
                    role={onSelect && shape.area.geography_id ? "button" : undefined}
                    onKeyDown={(event) => {
                      if (
                        (event.key === "Enter" || event.key === " ") &&
                        onSelect &&
                        shape.area.geography_id
                      ) {
                        event.preventDefault();
                        onSelect(shape.area.geography_id);
                      }
                    }}
                    data-interactive={
                      onSelect && shape.area.geography_id ? true : undefined
                    }
                    fill={
                      shape.area.value_percent !== null
                        ? shadeFor(shape.area.value_percent)
                        : shape.area.missing_reason === "no_model"
                          ? `url(#${id}-unmodelled)`
                          : shape.area.missing_reason === "running"
                            ? `url(#${id}-running)`
                            : `url(#${id}-pending)`
                    }
                    onMouseMove={(event) => {
                      const box =
                        event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                      setHovered({
                        area: shape.area,
                        x: event.clientX - (box?.left ?? 0),
                        y: event.clientY - (box?.top ?? 0),
                      });
                    }}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered({ area: shape.area, x: 0, y: 0 })}
                    onBlur={() => setHovered(null)}
                    tabIndex={onSelect && shape.area.geography_id ? 0 : undefined}
                    onClick={() => {
                      if (onSelect && shape.area.geography_id) {
                        onSelect(shape.area.geography_id);
                      }
                    }}
                    aria-label={label(shape.area)}
                  />
                );
              })}
            </svg>

            {hovered ? (
              <div
                className={styles.tooltip}
                style={{ left: hovered.x, top: hovered.y }}
                role="presentation"
              >
                <span className={styles.tooltipName}>{hovered.area.name}</span>
                <span
                  className={styles.tooltipValue}
                  data-state={stateOf(hovered.area)}
                >
                  {valueLine(hovered.area)}
                </span>
                <span className={styles.tooltipHint}>{hintFor(hovered.area)}</span>
              </div>
            ) : null}
          </div>

          {prepareError && (
            <p className={styles.notice} role="alert">
              {prepareError}
            </p>
          )}
          <div className={styles.actions}>
            <p className={styles.readout} aria-live="polite">
              {preparing > 0
                ? `Starting ${preparing} area${preparing === 1 ? "" : "s"}…`
                : hovered
                  ? label(hovered.area)
                  : describe(shapes, highest)}
            </p>
            {/* The explicit route stays open however small the automatic
                allowance is: a planner who wants the whole map now should not
                have to reload the page repeatedly to get it. */}
            {canPrepare && month && runnable.length > 0 ? (
              <button
                type="button"
                className={styles.prepareAll}
                onClick={() => void prepare(runnable)}
                disabled={preparing > 0}
              >
                {/* "Calculate" rather than "prepare", matching what an
                    un-run area is labelled on the map itself, so the button
                    plainly finishes the sentence the map starts. */}
                Calculate {runnable.length} more
                {runnable.length === 1 ? " area" : " areas"}
              </button>
            ) : null}
          </div>

          <div className={styles.legend} role="group" aria-label="Highlight risk range">
            {[...RISK_BANDS, { label: "Unavailable", fill: "#dedbd4" }].map((band) => (
              <button
                key={band.label}
                type="button"
                className={styles.legendItem}
                aria-pressed={activeBand === band.label}
                title={
                  activeBand === band.label
                    ? "Show all ranges"
                    : `Highlight ${band.label.toLowerCase()} areas`
                }
                onClick={() =>
                  setActiveBand(activeBand === band.label ? null : band.label)
                }
              >
                <span
                  className={styles.legendSwatch}
                  style={{ background: band.fill }}
                  aria-hidden="true"
                />
                {band.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 420;
const PADDING = 8;

type ProjectedArea = { area: MapArea; path: string };

/** Local equirectangular view, true scale at the bounds' middle latitude.
 * https://proj.org/en/stable/operations/projections/eqc.html
 * A display approximation for regional maps, not a measurement projection. */
function projectAreas(data: MapResponse): ProjectedArea[] {
  const [west, south, east, north] = data.bounds;
  if (
    [west, south, east, north].some((value) => !Number.isFinite(value)) ||
    east <= west ||
    north <= south ||
    south < -90 ||
    north > 90
  ) {
    return [];
  }
  const longitudeScale = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const spanX = (east - west) * longitudeScale;
  const spanY = north - south;
  // Longitude degrees shorten away from the equator. Correct that before
  // fitting both axes with one scale, then centre the result.
  const scale = Math.min(
    (VIEW_WIDTH - PADDING * 2) / spanX,
    (VIEW_HEIGHT - PADDING * 2) / spanY,
  );
  const offsetX = (VIEW_WIDTH - spanX * scale) / 2;
  const offsetY = (VIEW_HEIGHT - spanY * scale) / 2;
  const toX = (lon: number) => (lon - west) * longitudeScale * scale + offsetX;
  const toY = (lat: number) => (north - lat) * scale + offsetY;

  return data.areas.flatMap((area) => {
    const path = geometryToPath(area.geometry, toX, toY);
    return path ? [{ area, path }] : [];
  });
}

function geometryToPath(
  geometry: MapArea["geometry"],
  toX: (lon: number) => number,
  toY: (lat: number) => number,
): string {
  if (!geometry) return "";
  const polygons =
    geometry.type === "MultiPolygon"
      ? (geometry.coordinates as number[][][][])
      : geometry.type === "Polygon"
        ? [geometry.coordinates as number[][][]]
        : [];
  const parts: string[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (
        ring.length < 4 ||
        ring.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))
      )
        continue;
      const points = ring.map(
        ([lon, lat]) => `${toX(lon).toFixed(1)},${toY(lat).toFixed(1)}`,
      );
      parts.push(`M${points.join("L")}Z`);
    }
  }
  return parts.join(" ");
}

/**
 * Four fixed bands rather than a continuous ramp.
 *
 * Two reasons. A reader cannot resolve a shade into a number from a gradient,
 * so the legend has to be readable as text — "10–15%" says what a colour
 * means, a gradient bar only says "more". And the breaks are fixed rather
 * than fitted to what is on screen: a scale that rescales itself per
 * selection makes a quiet month look exactly as alarming as a severe one,
 * because the darkest area is always the darkest colour.
 */
export const RISK_BANDS = [
  { upper: 5, label: "0–5%", fill: "#f2edcf" },
  { upper: 10, label: "5–10%", fill: "#d9a441" },
  { upper: 15, label: "10–15%", fill: "#c4632a" },
  { upper: Infinity, label: ">15%", fill: "#a3154f" },
] as const;

function bandFor(percent: number) {
  return RISK_BANDS.find((band) => percent <= band.upper) ?? RISK_BANDS[0];
}

function shadeFor(percent: number): string {
  return bandFor(percent).fill;
}

function stateOf(area: MapArea): "value" | "running" | "pending" | "unmodelled" {
  if (area.value_percent !== null) return "value";
  if (area.missing_reason === "running") return "running";
  if (area.missing_reason === "no_model") return "unmodelled";
  return "pending";
}

function valueLine(area: MapArea): string {
  if (area.value_percent !== null) {
    return `${area.value_percent.toLocaleString("en", { maximumFractionDigits: 2 })}% attributable`;
  }
  return {
    running: "Loading data…",
    unmodelled: "Not integrated",
    pending: "Not calculated yet",
  }[stateOf(area) as "running" | "unmodelled" | "pending"];
}

function hintFor(area: MapArea): string {
  if (area.value_percent !== null) {
    return area.on_training_support === false
      ? "Outside the model's training range"
      : "Select to open this area";
  }
  return {
    running: "Fetching observations and scoring them",
    unmodelled: "No model has been fitted for this area",
    pending: "Select this area to run it",
  }[stateOf(area) as "running" | "unmodelled" | "pending"];
}

function label(area: MapArea): string {
  if (area.value_percent !== null) {
    return `${area.name}: ${area.value_percent.toLocaleString("en", { maximumFractionDigits: 2 })}% attributable`;
  }
  // Say which kind of absence it is, because each needs something different
  // from the reader: one is already on its way, one is a selection away, one
  // needs a fitted model.
  return `${area.name}: ${valueLine(area).replace("…", "")} — ${hintFor(area)}`;
}

function describe(shapes: ProjectedArea[], highest: ProjectedArea | null): string {
  const shaded = shapes.filter((shape) => shape.area.value_percent !== null).length;
  if (shaded === 0) {
    return `No area has a result yet — ${shapes.length} areas shown, no estimates available.`;
  }
  const peak = highest
    ? `, highest in ${highest.area.name} at ${(highest.area.value_percent ?? 0).toLocaleString("en", { maximumFractionDigits: 2 })}%`
    : "";
  return `${shaded} of ${shapes.length} areas have a result${peak}.`;
}
