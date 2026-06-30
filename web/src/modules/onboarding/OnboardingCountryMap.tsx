"use client";

import { useEffect, useRef, useState } from "react";

type CountryBounds = {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
};

type OnboardingCountryMapProps = {
  bounds?: CountryBounds | null;
  countryName: string;
  geographyLabel?: string;
  marker?: {
    label: string;
    lat: number;
    lon: number;
  } | null;
};

type NominatimCountryResult = {
  boundingbox?: [string, string, string, string];
  lat?: string;
  lon?: string;
  display_name?: string;
};

const mapAttribution = "&copy; OpenStreetMap contributors";

export function OnboardingCountryMap({
  bounds = null,
  countryName,
  geographyLabel = "",
  marker = null,
}: OnboardingCountryMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

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
        center: [15, 10],
        zoom: 2,
        scrollWheelZoom: false,
        zoomControl: false,
      });

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: mapAttribution,
          maxZoom: 18,
        })
        .addTo(map);

      mapRef.current = map;
      layerRef.current = leaflet.layerGroup().addTo(map);
      setMapReady(true);

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
    let isMounted = true;

    async function renderCountry() {
      if (!mapReady || !mapRef.current || !layerRef.current) {
        return;
      }

      const [leaflet, loadedBounds] = await Promise.all([
        import("leaflet"),
        bounds
          ? Promise.resolve(bounds)
          : geographyLabel.trim()
            ? loadGeographyBounds(geographyLabel, countryName)
            : countryName.trim()
              ? loadCountryBounds(countryName)
              : Promise.resolve(null),
      ]);

      if (!isMounted || !loadedBounds || !mapRef.current || !layerRef.current) {
        return;
      }

      layerRef.current.clearLayers();

      const southWest: [number, number] = [loadedBounds.latMin, loadedBounds.lonMin];
      const northEast: [number, number] = [loadedBounds.latMax, loadedBounds.lonMax];
      const leafletBounds = leaflet.latLngBounds(southWest, northEast);

      leaflet
        .rectangle(leafletBounds, {
          color: "#2E9449",
          dashArray: "8,6",
          fillColor: "#2E9449",
          fillOpacity: 0.06,
          opacity: 0.8,
          weight: 2,
        })
        .addTo(layerRef.current);

      if (marker) {
        leaflet
          .circleMarker([marker.lat, marker.lon], {
            color: "#16431F",
            fillColor: "#2E9449",
            fillOpacity: 0.88,
            radius: 7,
            weight: 2,
          })
          .bindTooltip(marker.label, {
            direction: "top",
            offset: [0, -8],
            opacity: 0.92,
            permanent: false,
          })
          .addTo(layerRef.current);
      }

      mapRef.current.fitBounds(leafletBounds, {
        maxZoom: geographyLabel ? 10 : 6,
        padding: [24, 24],
      });
    }

    void renderCountry();

    return () => {
      isMounted = false;
    };
  }, [bounds, countryName, geographyLabel, mapReady, marker]);

  return (
    <div className="onboarding-osm-card">
      <div ref={mapElementRef} className="onboarding-osm-map" />
    </div>
  );
}

async function loadGeographyBounds(
  geographyName: string,
  countryName: string,
): Promise<CountryBounds | null> {
  const q = countryName ? `${geographyName}, ${countryName}` : geographyName;
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "1" })}`,
  );
  if (!response.ok) return null;
  const [result] = (await response.json()) as NominatimCountryResult[];
  const box = result?.boundingbox;
  if (!box) return null;
  return {
    latMin: Number(box[0]),
    latMax: Number(box[1]),
    lonMin: Number(box[2]),
    lonMax: Number(box[3]),
  };
}

async function loadCountryBounds(countryName: string): Promise<CountryBounds | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      country: countryName,
      format: "jsonv2",
      limit: "1",
    })}`,
  );

  if (!response.ok) {
    return null;
  }

  const [result] = (await response.json()) as NominatimCountryResult[];
  const box = result?.boundingbox;

  if (!box) {
    return null;
  }

  return {
    latMin: Number(box[0]),
    latMax: Number(box[1]),
    lonMin: Number(box[2]),
    lonMax: Number(box[3]),
  };
}
