"use client";

import { useEffect, useRef, useState } from "react";

type CountryBounds = {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
};

type OnboardingCountryMapProps = {
  countryName: string;
};

type NominatimCountryResult = {
  boundingbox?: [string, string, string, string];
  lat?: string;
  lon?: string;
  display_name?: string;
};

const mapAttribution = "&copy; OpenStreetMap contributors";

export function OnboardingCountryMap({ countryName }: OnboardingCountryMapProps) {
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
        scrollWheelZoom: true,
        zoomControl: true,
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
      if (!mapReady || !countryName.trim() || !mapRef.current || !layerRef.current) {
        return;
      }

      const [leaflet, bounds] = await Promise.all([
        import("leaflet"),
        loadCountryBounds(countryName),
      ]);

      if (!isMounted || !bounds || !mapRef.current || !layerRef.current) {
        return;
      }

      layerRef.current.clearLayers();

      const southWest: [number, number] = [bounds.latMin, bounds.lonMin];
      const northEast: [number, number] = [bounds.latMax, bounds.lonMax];
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

      mapRef.current.fitBounds(leafletBounds, {
        maxZoom: 6,
        padding: [24, 24],
      });
    }

    void renderCountry();

    return () => {
      isMounted = false;
    };
  }, [countryName, mapReady]);

  return (
    <div className="onboarding-osm-card">
      <div ref={mapElementRef} className="onboarding-osm-map" />
    </div>
  );
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
