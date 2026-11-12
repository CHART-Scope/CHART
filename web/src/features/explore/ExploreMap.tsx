"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { MapArea, MapResponse } from "@/lib/dashboardClient";

import { Icon, type IconName } from "@/components/Icon";

import {
  areaValueText,
  formatCount,
  colorFor,
  centreOf,
  geometryBounds,
  rankText,
  type Band,
  type ExploreLayer,
} from "./exploreData";
import styles from "./explore.module.css";

/**
 * The Explore map: the frame's areas shaded over an open street basemap.
 * New values recolour the same shapes in place (no blank frame), the
 * selected area is outlined and the rest dimmed, and choosing a place zooms
 * to it. Click selects; double click opens the areas beneath.
 */

const BASEMAP =
  process.env.NEXT_PUBLIC_EXPLORE_BASEMAP ??
  "https://tiles.openfreemap.org/styles/positron";
const SOURCE = "areas";
const OVERLAY = "overlay";
/** Used when the basemap cannot load (offline, blocked): areas still show. */
const PLAIN_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background" as const,
      paint: { "background-color": "#f2efe9" },
    },
  ],
};

type Props = {
  data: MapResponse | null;
  layer: ExploreLayer;
  bands: Band[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (geographyId: string) => void;
  onOpen: (geographyId: string) => void;
  onHover?: (geographyId: string | null) => void;
  /**
   * On a new frame, zoom to the selected place ("selection", e.g. a search
   * pick) or show the whole frame with it outlined ("frame", going up).
   */
  frameView?: "selection" | "frame";
  /** The design team's figure for the measure shaded (newborn, child). */
  figure?: IconName | null;
  /** A line under the value, e.g. "of births · Sep 2026". */
  caption?: string | null;
  /** The level beneath a place ("districts"), or null when it has none. */
  childLabel?: (geographyId: string) => string | null;
  /** A per-area line, e.g. a forecast's range across systems. */
  note?: (area: MapArea) => string | null;
  /**
   * A click on no drawn area: resolves true when the point is a covered place
   * (Explore moves there), false to offer "not covered yet" at the point.
   */
  onOutside?: (lngLat: [number, number]) => Promise<boolean>;
  /** Vulnerability (VRA) per area, drawn as dots over the shading. */
  overlay?: MapResponse | null;
  /** The area's people, from WorldPop, when known. */
  people?: (area: MapArea) => {
    total: number;
    under5: number;
    women_15_49: number;
    year: number;
  } | null;
};

type Hover = { area: MapArea; x: number; y: number; flip: boolean };
type Outside = { x: number; y: number; lat: number; lng: number };

export function ExploreMap({
  data,
  layer,
  bands,
  selectedId,
  loading,
  onSelect,
  onOpen,
  onHover,
  frameView = "selection",
  figure,
  caption,
  childLabel,
  note,
  people,
  onOutside,
  overlay,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const framedId = useRef<string | null>(null);
  const flownTo = useRef<string | null>(null);
  // Counts style loads: a fallback style needs the areas painted again.
  const [styleLoads, setStyleLoads] = useState(0);
  const ready = styleLoads > 0;
  const [hover, setHover] = useState<Hover | null>(null);
  const [outside, setOutside] = useState<Outside | null>(null);
  // Handlers read the latest props without re-binding map events.
  const latest = useRef({
    data,
    selectedId,
    onSelect,
    onOpen,
    onHover,
    onOutside,
    frameView,
  });
  latest.current = {
    data,
    selectedId,
    onSelect,
    onOpen,
    onHover,
    onOutside,
    frameView,
  };

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: BASEMAP,
      center: [78, 22],
      zoom: 4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      doubleClickZoom: false,
      fadeDuration: 0,
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    let fellBack = false;
    instance.on("error", () => {
      if (!fellBack && !instance.getSource(SOURCE)) {
        fellBack = true;
        instance.setStyle(PLAIN_STYLE);
      }
    });
    instance.on("style.load", () => {
      if (instance.getSource(SOURCE)) return;
      instance.addSource(SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "geography_id",
      });
      instance.addLayer({
        id: "area-fill",
        type: "fill",
        source: SOURCE,
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.7 },
      });
      instance.addLayer({
        id: "area-outline",
        type: "line",
        source: SOURCE,
        paint: { "line-color": "#ffffff", "line-width": 1 },
      });
      instance.addSource(OVERLAY, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Vulnerability dots: bigger and darker where the index is higher.
      instance.addLayer({
        id: "overlay-dots",
        type: "circle",
        source: OVERLAY,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "value"], 0, 3, 100, 11],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "value"],
            0,
            "#c9b8f0",
            100,
            "#3d1a8f",
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      instance.addLayer({
        id: "area-hover",
        type: "line",
        source: SOURCE,
        paint: {
          "line-color": "#1e1f21",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1.5,
            0,
          ],
        },
      });
      // A white casing under a dark line reads on every fill colour.
      instance.addLayer({
        id: "area-selected-casing",
        type: "line",
        source: SOURCE,
        filter: ["==", ["get", "geography_id"], ""],
        paint: { "line-color": "#ffffff", "line-width": 6 },
      });
      instance.addLayer({
        id: "area-selected",
        type: "line",
        source: SOURCE,
        filter: ["==", ["get", "geography_id"], ""],
        paint: { "line-color": "#1e1f21", "line-width": 2.5 },
      });
      framedId.current = null;
      setStyleLoads((count) => count + 1);
    });
    let hovered: string | null = null;
    const clearHover = () => {
      if (hovered)
        instance.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
      hovered = null;
    };
    instance.on("mousemove", "area-fill", (event) => {
      const id = event.features?.[0]?.properties?.geography_id as string | undefined;
      if (!id) return;
      instance.getCanvas().style.cursor = "pointer";
      if (hovered !== id) {
        clearHover();
        hovered = id;
        instance.setFeatureState({ source: SOURCE, id }, { hover: true });
        latest.current.onHover?.(id);
      }
      const area = latest.current.data?.areas.find((item) => item.geography_id === id);
      const width = instance.getCanvas().clientWidth;
      if (area)
        setHover({
          area,
          x: event.point.x,
          y: event.point.y,
          flip: event.point.x > width - 260,
        });
    });
    instance.on("mouseleave", "area-fill", () => {
      instance.getCanvas().style.cursor = "";
      clearHover();
      setHover(null);
      latest.current.onHover?.(null);
    });
    instance.on("click", "area-fill", (event) => {
      const id = event.features?.[0]?.properties?.geography_id as string | undefined;
      if (id) latest.current.onSelect(id);
    });
    instance.on("click", (event) => {
      setOutside(null);
      if (instance.queryRenderedFeatures(event.point, { layers: ["area-fill"] }).length)
        return;
      const { lng, lat } = event.lngLat;
      const point = { x: event.point.x, y: event.point.y, lat, lng };
      void latest.current.onOutside?.([lng, lat]).then((covered) => {
        if (!covered) setOutside(point);
      });
    });
    instance.on("movestart", () => setOutside(null));
    instance.on("dblclick", "area-fill", (event) => {
      const id = event.features?.[0]?.properties?.geography_id as string | undefined;
      if (id) latest.current.onOpen(id);
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  // New values recolour the shapes in place; a new frame is fitted once.
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const source = instance.getSource(SOURCE) as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: (data?.areas ?? [])
        .filter((area) => area.geometry && area.geography_id)
        .map((area) => ({
          type: "Feature",
          geometry: area.geometry as GeoJSON.Geometry,
          properties: {
            geography_id: area.geography_id,
            color: colorFor(area.value_percent, bands),
          },
        })),
    });
    // Keep the hover card's values in step with the colours under it.
    setHover((current) => {
      if (!current) return current;
      const area = data?.areas.find(
        (item) => item.geography_id === current.area.geography_id,
      );
      return area ? { ...current, area } : null;
    });
    if (data && framedId.current !== data.geography_id && data.bounds.length === 4) {
      framedId.current = data.geography_id;
      flownTo.current = null;
      const chosen = latest.current.selectedId;
      const target =
        chosen && latest.current.frameView === "selection"
          ? geometryBounds(
              data.areas.find((area) => area.geography_id === chosen)?.geometry ?? null,
            )
          : null;
      const [west, south, east, north] = target ?? data.bounds;
      instance.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: target ? 96 : 48, duration: 600, maxZoom: 12 },
      );
      // Outlined but not zoomed to: the selection must not fly in either.
      flownTo.current = chosen;
    }
  }, [ready, styleLoads, data, bands]);

  // The overlay's dots, one per assessed area with a value.
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const source = instance.getSource(OVERLAY) as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: (overlay?.areas ?? []).flatMap((area) => {
        const centre = area.value_percent !== null ? centreOf(area.geometry) : null;
        return centre
          ? [
              {
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: centre },
                properties: { value: area.value_percent },
              },
            ]
          : [];
      }),
    });
  }, [ready, styleLoads, overlay]);

  // The selection is outlined, the rest dimmed, and the map moves to it.
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const filter: maplibregl.FilterSpecification = [
      "==",
      ["get", "geography_id"],
      selectedId ?? "",
    ];
    instance.setFilter("area-selected", filter);
    instance.setFilter("area-selected-casing", filter);
    instance.setPaintProperty(
      "area-fill",
      "fill-opacity",
      selectedId
        ? ["case", ["==", ["get", "geography_id"], selectedId], 0.92, 0.4]
        : 0.7,
    );
    if (!selectedId) {
      // Leaving a place zooms back out to the whole area being viewed.
      const frame = latest.current.data;
      if (flownTo.current && frame && frame.bounds.length === 4) {
        const [west, south, east, north] = frame.bounds;
        instance.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding: 48, duration: 700 },
        );
      }
      flownTo.current = null;
      return;
    }
    if (flownTo.current === selectedId) return;
    const area = latest.current.data?.areas.find(
      (item) => item.geography_id === selectedId,
    );
    const bounds = geometryBounds(area?.geometry ?? null);
    if (!bounds) return;
    flownTo.current = selectedId;
    const [west, south, east, north] = bounds;
    instance.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 96, duration: 700, maxZoom: 12 },
    );
  }, [ready, styleLoads, selectedId, data]);

  const rank = hover && data ? rankText(data.areas, hover.area) : null;
  const band =
    hover && hover.area.value_percent !== null
      ? colorFor(hover.area.value_percent, bands)
      : null;

  return (
    <div className={styles.mapFrame} aria-busy={loading}>
      <div ref={container} className={styles.map} data-testid="explore-map" />
      <div className={styles.mapProgress} data-active={loading || undefined} />
      {loading && !data && (
        <div className={styles.mapFirstLoad} role="status">
          <span className={styles.spinner} aria-hidden="true" /> Loading map…
        </div>
      )}
      {outside && (
        <div
          className={styles.outside}
          role="dialog"
          aria-label="Not covered yet"
          data-testid="explore-outside"
          style={{
            left: Math.min(outside.x, (container.current?.clientWidth ?? 0) - 270),
            top: Math.max(8, outside.y - 12),
          }}
        >
          <button
            type="button"
            className={styles.outsideClose}
            aria-label="Close"
            onClick={() => setOutside(null)}
          >
            ×
          </button>
          <strong>CHART isn&rsquo;t here yet</strong>
          <p>
            Estimates cover Kenya and Madhya Pradesh, India, today. Data, modelling or
            funding can bring CHART to this area.
          </p>
          <a href={`/support?near=${outside.lat.toFixed(2)},${outside.lng.toFixed(2)}`}>
            Help bring CHART here →
          </a>
        </div>
      )}
      {hover && (
        <div
          className={styles.tooltip}
          style={
            hover.flip
              ? { right: `calc(100% - ${hover.x - 14}px)`, top: hover.y + 14 }
              : { left: hover.x + 14, top: hover.y + 14 }
          }
          role="status"
          data-testid="explore-hover"
        >
          <span className={styles.tooltipLevel}>{hover.area.level}</span>
          <strong className={styles.tooltipName}>{hover.area.name}</strong>
          <span className={styles.tooltipMain}>
            {figure && hover.area.value_percent !== null && (
              <Icon name={figure} size={30} className={styles.tooltipFigure} />
            )}
            <span>
              <span className={styles.tooltipValue}>
                {band && <i style={{ background: band }} />}
                {areaValueText(hover.area, layer)}
              </span>
              {caption && <small className={styles.tooltipCaption}>{caption}</small>}
            </span>
          </span>
          {note?.(hover.area) && (
            <span className={styles.tooltipRank}>{note(hover.area)}</span>
          )}
          {rank && <span className={styles.tooltipRank}>{rank}</span>}
          {(() => {
            const vra = overlay?.areas.find(
              (item) => item.geography_id === hover.area.geography_id,
            )?.value_percent;
            return vra !== undefined && vra !== null ? (
              <span className={styles.tooltipVra}>
                <i /> Vulnerability (VRA) {(vra / 100).toFixed(2)}
              </span>
            ) : null;
          })()}
          {(() => {
            const found = people?.(hover.area);
            return found ? (
              <span className={styles.tooltipPeople}>
                <span title="Children under five">
                  <Icon name="child" size={18} /> {formatCount(found.under5)}
                  <small>under five</small>
                </span>
                <span title="Women aged 15 to 49">
                  <Icon name="pregnant-woman" size={18} />{" "}
                  {formatCount(found.women_15_49)}
                  <small>women 15–49</small>
                </span>
                <small className={styles.tooltipSource}>
                  of {formatCount(found.total)} people · WorldPop {found.year}
                </small>
              </span>
            ) : null;
          })()}
          <small className={styles.tooltipHint}>
            {(() => {
              const below = childLabel?.(hover.area.geography_id ?? "");
              const first =
                hover.area.geography_id === selectedId
                  ? "Selected"
                  : "Click for details";
              // Only places with areas beneath them can be opened.
              return below ? `${first} · double-click for its ${below}` : first;
            })()}
          </small>
        </div>
      )}
    </div>
  );
}
