"use client";

import { useEffect, useRef } from "react";

import type { DashboardZone, HealthPost } from "../../content/dashboard";

type MapLayer = "heat" | "flood" | "population" | "composite";

type OpenStreetMapPanelProps = {
  layer: MapLayer;
  zones: DashboardZone[];
  healthPosts: HealthPost[];
  selectedZoneId: string;
  onSelectZone: (zoneId: string) => void;
  boundary: [number, number][];
};

function getLevelColor(level: DashboardZone["level"]) {
  if (level === "crit") {
    return "#E86B6B";
  }

  if (level === "high") {
    return "#F0936B";
  }

  if (level === "med") {
    return "#EFB85A";
  }

  return "#6CBB8A";
}

function getRadius(zone: DashboardZone, layer: MapLayer) {
  if (layer === "population") {
    return Math.max(10, Math.sqrt(zone.population) * 0.09);
  }

  if (layer === "heat") {
    return Math.max(10, zone.heat * 0.42);
  }

  if (layer === "flood") {
    return Math.max(10, zone.flood * 0.42);
  }

  return Math.max(10, ((zone.heat + zone.mnch) / 2) * 0.42);
}

function getLayerValue(zone: DashboardZone, layer: MapLayer) {
  if (layer === "population") {
    return `${Math.round(zone.population / 1000)}k`;
  }

  if (layer === "heat") {
    return String(zone.heat);
  }

  if (layer === "flood") {
    return String(zone.flood);
  }

  return String(Math.round((zone.heat + zone.mnch) / 2));
}

export function OpenStreetMapPanel({
  layer,
  zones,
  healthPosts,
  selectedZoneId,
  onSelectZone,
  boundary,
}: OpenStreetMapPanelProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerGroupRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let isMounted = true;
    let mapInstance: import("leaflet").Map | null = null;

    async function initializeMap() {
      if (!mapElementRef.current || mapRef.current) {
        return;
      }

      const leaflet = await import("leaflet");

      if (!isMounted || !mapElementRef.current) {
        return;
      }

      const map = leaflet.map(mapElementRef.current, {
        center: [26.17, 78.2],
        zoom: 10,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(map);

      leaflet
        .polygon(boundary, {
          color: "#E86B6B",
          weight: 2,
          opacity: 0.75,
          fillColor: "#E86B6B",
          fillOpacity: 0.03,
          dashArray: "6,4",
        })
        .addTo(map);

      healthPosts.forEach((post) => {
        leaflet
          .circleMarker([post.lat, post.lng], {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: "#0EA5A5",
            fillOpacity: 1,
          })
          .addTo(map)
          .bindTooltip(post.name, {
            direction: "top",
            offset: [0, -8],
          });
      });

      mapRef.current = map;
      layerGroupRef.current = leaflet.layerGroup().addTo(map);
      mapInstance = map;

      requestAnimationFrame(() => {
        map.invalidateSize();
      });
    }

    void initializeMap();

    return () => {
      isMounted = false;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      layerGroupRef.current = null;
      mapInstance = null;
    };
  }, [boundary, healthPosts]);

  useEffect(() => {
    let isMounted = true;

    async function renderZoneLayer() {
      if (!layerGroupRef.current) {
        return;
      }

      const leaflet = await import("leaflet");

      if (!isMounted || !layerGroupRef.current) {
        return;
      }

      layerGroupRef.current.clearLayers();

      zones.forEach((zone) => {
        const color = getLevelColor(zone.level);
        const radius = getRadius(zone, layer);

        leaflet
          .circleMarker([zone.lat, zone.lng], {
            radius: radius * 2.4,
            color,
            weight: 0,
            fillColor: color,
            fillOpacity: 0.11,
            interactive: false,
          })
          .addTo(layerGroupRef.current as import("leaflet").LayerGroup);

        leaflet
          .circleMarker([zone.lat, zone.lng], {
            radius: radius * 1.5,
            color,
            weight: 0,
            fillColor: color,
            fillOpacity: 0.22,
            interactive: false,
          })
          .addTo(layerGroupRef.current as import("leaflet").LayerGroup);

        const core = leaflet
          .circleMarker([zone.lat, zone.lng], {
            radius,
            color: selectedZoneId === zone.id ? "#111827" : "#ffffff",
            weight: selectedZoneId === zone.id ? 2.4 : 1.5,
            fillColor: color,
            fillOpacity: 0.8,
          })
          .addTo(layerGroupRef.current as import("leaflet").LayerGroup);

        core.bindTooltip(zone.name, {
          direction: "top",
          offset: [0, -radius - 2],
        });
        core.bindPopup(
          `<div class="map-popup-title">${zone.name}</div>
           <div class="map-popup-row"><span>Layer value</span><b>${getLayerValue(
             zone,
             layer,
           )}</b></div>
           <div class="map-popup-row"><span>Heat</span><b>${zone.heat}</b></div>
           <div class="map-popup-row"><span>Flood</span><b>${zone.flood}</b></div>
           <div class="map-popup-row"><span>MNCH</span><b>${zone.mnch}</b></div>`,
        );
        core.on("click", () => onSelectZone(zone.id));
      });
    }

    void renderZoneLayer();

    return () => {
      isMounted = false;
    };
  }, [layer, onSelectZone, selectedZoneId, zones]);

  return (
    <div className="map-panel">
      <div className="map-canvas" ref={mapElementRef} />
      <div className="map-legend">
        <div className="map-legend-title">Risk level</div>
        <div className="map-legend-row">
          <span className="map-legend-dot crit" />
          Critical
        </div>
        <div className="map-legend-row">
          <span className="map-legend-dot high" />
          High
        </div>
        <div className="map-legend-row">
          <span className="map-legend-dot med" />
          Medium
        </div>
        <div className="map-legend-row">
          <span className="map-legend-dot low" />
          Low
        </div>
      </div>
    </div>
  );
}
