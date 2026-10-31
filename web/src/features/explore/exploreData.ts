/**
 * Pure helpers for the public Explore view: the place tree, the colour
 * classes a map value falls in, and the calendar a month strip shows.
 */

import type { MapArea } from "@/lib/dashboardClient";

export type ExplorePlace = {
  id: string;
  name: string;
  path: string;
  countryCode: string;
  level: string;
  levelLabel: string;
  parentId: string | null;
};

export type ExploreLayer = "observed" | "projection" | "vulnerability";

export const OUTCOMES = [
  { code: "lbw", label: "Low birth weight" },
  { code: "under_5_mortality", label: "Under-five deaths" },
] as const;

export const COUNTRIES = [
  { code: "IN", label: "India", start: "geo-in-madhya-pradesh" },
  { code: "KE", label: "Kenya", start: "geo-ke" },
] as const;

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type Band = { upper: number; label: string; color: string };

/** Heat-attributable share, percent of cases. Same classes as the dashboard. */
export const SHARE_BANDS: Band[] = [
  { upper: 5, label: "0–5%", color: "#f8e3c6" },
  { upper: 10, label: "5–10%", color: "#f2b06a" },
  { upper: 15, label: "10–15%", color: "#e0602c" },
  { upper: Number.POSITIVE_INFINITY, label: ">15%", color: "#7d1d2a" },
];

/**
 * VRA index (0–1), read from ``value_percent`` = index × 100. Shown as index
 * ranges: the assessment's own risk classes are relative and live on the
 * Vulnerability page.
 */
export const VULNERABILITY_BANDS: Band[] = [
  { upper: 25, label: "0–0.25", color: "#dfe8f3" },
  { upper: 50, label: "0.25–0.5", color: "#9db8db" },
  { upper: 75, label: "0.5–0.75", color: "#4f78b4" },
  { upper: Number.POSITIVE_INFINITY, label: "0.75–1", color: "#1f3c73" },
];

export const NO_VALUE_COLOR = "#d9d6d0";

export function bandsFor(layer: ExploreLayer): Band[] {
  return layer === "vulnerability" ? VULNERABILITY_BANDS : SHARE_BANDS;
}

export function colorFor(value: number | null, bands: Band[]): string {
  if (value === null || Number.isNaN(value)) return NO_VALUE_COLOR;
  return (bands.find((band) => value <= band.upper) ?? bands[bands.length - 1]).color;
}

export function children(places: ExplorePlace[], parentId: string): ExplorePlace[] {
  return places.filter((place) => place.parentId === parentId);
}

/** The place and its ancestors, country first. */
export function lineage(places: ExplorePlace[], id: string): ExplorePlace[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const chain: ExplorePlace[] = [];
  let current = byId.get(id);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** Stored months grouped by year, newest year last. */
export function monthsByYear(months: string[]): Map<string, string[]> {
  const years = new Map<string, string[]>();
  for (const month of [...months].sort()) {
    const year = month.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), month]);
  }
  return years;
}

export function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTH_LABELS[Number(number) - 1]} ${year}`;
}

/** "Dec–Mar" for a season that may wrap the year end. */
export function seasonLabel(months: number[]): string {
  if (!months.length) return "";
  return `${MONTH_LABELS[months[0] - 1]}–${MONTH_LABELS[months[months.length - 1] - 1]}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return `${value.toFixed(1)}%`;
}

export function areaValueText(area: MapArea, layer: ExploreLayer): string {
  if (area.value_percent === null) {
    if (area.missing_reason === "no_model") return "No model for this area";
    if (area.missing_reason === "no_excess") return "No heat excess";
    return "Not reported";
  }
  if (layer === "vulnerability") {
    return `Vulnerability ${(area.value_percent / 100).toFixed(2)}`;
  }
  return `${formatPercent(area.value_percent)} of cases linked to heat`;
}
