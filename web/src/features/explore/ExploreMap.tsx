"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { MapArea, MapResponse } from "@/lib/dashboardClient";

import { areaValueText, colorFor, type Band, type ExploreLayer } from "./exploreData";
import styles from "./explore.module.css";

/**
 * The Explore map: the selected frame's areas shaded over an open street
 * basemap. Zoom and pan are the map's own; a click selects an area and a
 * double click opens the areas beneath it.
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
};

export function ExploreMap({
  data,
  layer,
  bands,
  selectedId,
  loading,
  onSelect,
  onOpen,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const framedId = useRef<string | null>(null);
  // Counts style loads: a fallback style needs the areas painted again.
  const [styleLoads, setStyleLoads] = useState(0);
  const ready = styleLoads > 0;
  const [hover, setHover] = useState<{ area: MapArea; x: number; y: number } | null>(
    null,
  );
  // Handlers read the latest props without re-binding map events.
  const latest = useRef({ data, layer, onSelect, onOpen });
  latest.current = { data, layer, onSelect, onOpen };

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
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.82,
            0.62,
          ],
        },
      });
      instance.addLayer({
        id: "area-outline",
        type: "line",
        source: SOURCE,
        paint: { "line-color": "#ffffff", "line-width": 1 },
      });
      instance.addLayer({
        id: "area-selected",
        type: "line",
        source: SOURCE,
        filter: ["==", ["get", "geography_id"], ""],
        paint: { "line-color": "#c8102e", "line-width": 2.5 },
      });
      framedId.current = null;
      setStyleLoads((count) => count + 1);
    });
    let hovered: string | null = null;
    instance.on("mousemove", "area-fill", (event) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.geography_id as string | undefined;
      if (!id) return;
      instance.getCanvas().style.cursor = "pointer";
      if (hovered !== id) {
        if (hovered)
          instance.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
        hovered = id;
        instance.setFeatureState({ source: SOURCE, id }, { hover: true });
      }
      const area = latest.current.data?.areas.find((item) => item.geography_id === id);
      if (area) setHover({ area, x: event.point.x, y: event.point.y });
    });
    instance.on("mouseleave", "area-fill", () => {
      instance.getCanvas().style.cursor = "";
      if (hovered)
        instance.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
      hovered = null;
      setHover(null);
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

  // New values or a new frame: repaint, and fit when the frame changed.
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || !data) return;
    // A hover box from the previous frame would name an area no longer shown.
    setHover(null);
    const source = instance.getSource(SOURCE) as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: data.areas
        .filter((area) => area.geometry && area.geography_id)
        .map((area) => ({
          type: "Feature",
          geometry: area.geometry as GeoJSON.Geometry,
          properties: {
            geography_id: area.geography_id,
            name: area.name,
            color: colorFor(area.value_percent, bands),
          },
        })),
    });
    if (framedId.current !== data.geography_id && data.bounds.length === 4) {
      framedId.current = data.geography_id;
      const [west, south, east, north] = data.bounds;
      instance.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 48, duration: 600 },
      );
    }
  }, [ready, styleLoads, data, bands]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    instance.setFilter("area-selected", [
      "==",
      ["get", "geography_id"],
      selectedId ?? "",
    ]);
  }, [ready, styleLoads, selectedId]);

  return (
    <div className={styles.mapFrame} aria-busy={loading}>
      <div ref={container} className={styles.map} data-testid="explore-map" />
      {loading && <div className={styles.mapLoading}>Loading map…</div>}
      {hover && (
        <div
          className={styles.tooltip}
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          role="status"
        >
          <strong>{hover.area.name}</strong>
          <span>{areaValueText(hover.area, layer)}</span>
          <small>Click to select · double-click to open</small>
        </div>
      )}
    </div>
  );
}
