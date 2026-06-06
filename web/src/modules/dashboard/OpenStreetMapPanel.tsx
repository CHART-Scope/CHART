"use client";

import { useEffect, useRef, useState } from "react";

import type { GeographyRecord } from "../../lib/geographyClient";

type OpenStreetMapPanelProps = {
  selectedGeography?: GeographyRecord;
};

type LookupState = "idle" | "loading" | "found" | "not-found" | "error";

type NominatimResult = {
  display_name?: string;
  boundingbox?: [string, string, string, string];
  lat?: string;
  lon?: string;
};

const mapAttribution = "&copy; OpenStreetMap contributors";

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function pathPartToPlaceName(pathPart: string) {
  return titleCase(pathPart.replace(/-/g, " "));
}

function searchQueryForGeography(geography: GeographyRecord) {
  const selectedName = geography.name.toLowerCase();
  const ancestorNames = geography.path
    .split("/")
    .filter(Boolean)
    .map(pathPartToPlaceName)
    .reverse()
    .filter((part) => part.toLowerCase() !== selectedName);

  return [geography.name, ...ancestorNames].join(", ");
}

async function lookupGeography(
  geography: GeographyRecord,
  signal: AbortSignal,
): Promise<NominatimResult | undefined> {
  const params = new URLSearchParams({
    q: searchQueryForGeography(geography),
    format: "jsonv2",
    limit: "1",
  });

  if (geography.countryCode.length === 2) {
    params.set("countrycodes", geography.countryCode.toLowerCase());
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error("OpenStreetMap lookup failed.");
  }

  const results = (await response.json()) as NominatimResult[];

  return results[0];
}

export function OpenStreetMapPanel({ selectedGeography }: OpenStreetMapPanelProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>("idle");

  useEffect(() => {
    let isMounted = true;

    async function initializeMap() {
      if (!mapElementRef.current || mapRef.current) {
        return;
      }

      const leaflet = await import("leaflet");

      if (!isMounted || !mapElementRef.current) {
        return;
      }

      const map = leaflet.map(mapElementRef.current, {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: mapAttribution,
          maxZoom: 19,
        })
        .addTo(map);

      mapRef.current = map;
      layerRef.current = leaflet.layerGroup().addTo(map);

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

      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedGeography || !mapRef.current || !layerRef.current) {
      setLookupState(selectedGeography ? "loading" : "idle");
      return;
    }

    const controller = new AbortController();
    let isMounted = true;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 8000);

    async function renderSelectedGeography() {
      if (!mapRef.current || !layerRef.current || !selectedGeography) {
        return;
      }

      setLookupState("loading");
      layerRef.current.clearLayers();

      try {
        const leaflet = await import("leaflet");
        const result = await lookupGeography(selectedGeography, controller.signal);

        if (!isMounted || !mapRef.current || !layerRef.current) {
          return;
        }

        if (!result?.boundingbox) {
          setLookupState("not-found");
          return;
        }

        const [south, north, west, east] = result.boundingbox.map(Number);
        const bounds = leaflet.latLngBounds([south, west], [north, east]);

        leaflet
          .rectangle(bounds, {
            color: "#185E2B",
            weight: 2,
            fillColor: "#5FB96F",
            fillOpacity: 0.12,
          })
          .addTo(layerRef.current);

        if (result.lat && result.lon) {
          leaflet
            .circleMarker([Number(result.lat), Number(result.lon)], {
              radius: 7,
              color: "#ffffff",
              weight: 2,
              fillColor: "#185E2B",
              fillOpacity: 1,
            })
            .addTo(layerRef.current)
            .bindTooltip(selectedGeography.name, {
              direction: "top",
              offset: [0, -8],
            })
            .openTooltip();
        }

        mapRef.current.fitBounds(bounds, {
          animate: true,
          padding: [28, 28],
          maxZoom: 8,
        });
        setLookupState("found");
      } catch (error) {
        if (isMounted && (!controller.signal.aborted || didTimeout)) {
          setLookupState("error");
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    void renderSelectedGeography();

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedGeography]);

  return (
    <div className="map-panel">
      <div className="map-canvas" ref={mapElementRef} />
      <div className="map-legend">
        <div className="map-legend-title">Map data</div>
        <div className="map-legend-row">
          <span className="map-legend-dot low" />
          OpenStreetMap
        </div>
        <div className="map-legend-row">
          <span className="map-legend-line" />
          Selected geography
        </div>
      </div>
      <div className="map-status-card">
        {lookupState === "idle" ? "Select a configured geography to locate it." : null}
        {lookupState === "loading" ? "Looking up geography in OpenStreetMap..." : null}
        {lookupState === "found" ? "Showing OpenStreetMap match." : null}
        {lookupState === "not-found"
          ? "OpenStreetMap could not locate this geography name."
          : null}
        {lookupState === "error"
          ? "OpenStreetMap lookup failed. Try again when network access is available."
          : null}
      </div>
    </div>
  );
}
