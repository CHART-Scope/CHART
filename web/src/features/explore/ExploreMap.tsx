"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { MapArea, MapResponse } from "@/lib/dashboardClient";

import {
  areaValueText,
  colorFor,
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
  /** A second line for the hover card, e.g. an area's head counts. */
  detail?: (area: MapArea) => string | null;
};

type Hover = { area: MapArea; x: number; y: number; flip: boolean };

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
  detail,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const framedId = useRef<string | null>(null);
  const flownTo = useRef<string | null>(null);
  // Counts style loads: a fallback style needs the areas painted again.
  const [styleLoads, setStyleLoads] = useState(0);
  const ready = styleLoads > 0;
  const [hover, setHover] = useState<Hover | null>(null);
  // Handlers read the latest props without re-binding map events.
  const latest = useRef({ data, selectedId, onSelect, onOpen, onHover, frameView });
  latest.current = { data, selectedId, onSelect, onOpen, onHover, frameView };

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
      {hover && (
        <div
          className={styles.tooltip}
          style={
            hover.flip
              ? { right: `calc(100% - ${hover.x - 14}px)`, top: hover.y + 14 }
              : { left: hover.x + 14, top: hover.y + 14 }
          }
          role="status"
        >
          <span className={styles.tooltipLevel}>{hover.area.level}</span>
          <strong>{hover.area.name}</strong>
          <span className={styles.tooltipValue}>
            {band && <i style={{ background: band }} />}
            {areaValueText(hover.area, layer)}
          </span>
          {detail?.(hover.area) && (
            <span className={styles.tooltipRank}>{detail(hover.area)}</span>
          )}
          {rank && <span className={styles.tooltipRank}>{rank}</span>}
          <small>
            {hover.area.geography_id === selectedId
              ? "Selected · double-click to open"
              : "Click for details · double-click to open"}
          </small>
        </div>
      )}
    </div>
  );
}
