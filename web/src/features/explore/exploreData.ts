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

export type ExploreLayer =
  "observed" | "forecast" | "projection" | "tmax" | "heat_days" | "population";

export const POPULATION_MEASURES = [
  { code: "total", label: "Everyone" },
  { code: "under5", label: "Under five" },
  { code: "women_15_49", label: "Women 15–49" },
] as const;

/** Layers read from ERA5-Land, by month, that no health estimate uses. */
export const CLIMATE_LAYERS: ExploreLayer[] = ["tmax", "heat_days"];

export const OUTCOMES = [
  { code: "lbw", label: "Low birth weight" },
  { code: "under_5_mortality", label: "Under-five deaths" },
] as const;

export const COUNTRIES = [
  { code: "IN", label: "India", start: "geo-in-madhya-pradesh", path: "/india" },
  { code: "KE", label: "Kenya", start: "geo-ke", path: "/kenya" },
] as const;

/** The country a place sits in, from its code or, failing that, its path. */
export function countryOf(place: ExplorePlace | undefined) {
  if (!place) return undefined;
  return COUNTRIES.find(
    (country) =>
      country.code === place.countryCode ||
      place.path === country.path ||
      place.path.startsWith(`${country.path}/`),
  );
}

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

/**
 * Heat-attributable share, percent of cases, in 5-point steps up to 35%.
 * Projected shares in Madhya Pradesh run 25-34% across its divisions; the
 * dashboard's top class (">15%") painted the whole state one colour.
 */
const SHARE_BANDS: Band[] = [
  { upper: 5, label: "0–5%", color: "#fbecd6" },
  { upper: 10, label: "5–10%", color: "#f6cf95" },
  { upper: 15, label: "10–15%", color: "#f0a65e" },
  { upper: 20, label: "15–20%", color: "#e27a3d" },
  { upper: 25, label: "20–25%", color: "#c8502e" },
  { upper: 30, label: "25–30%", color: "#a1302a" },
  { upper: 35, label: "30–35%", color: "#741c27" },
  { upper: Number.POSITIVE_INFINITY, label: ">35%", color: "#45101a" },
];

/** Monthly mean of daily maximum temperature, °C. */
const TEMPERATURE_BANDS: Band[] = [
  { upper: 24, label: "<24°", color: "#2c7bb6" },
  { upper: 27, label: "24–27°", color: "#abd9e9" },
  { upper: 30, label: "27–30°", color: "#ffffbf" },
  { upper: 33, label: "30–33°", color: "#fdd78a" },
  { upper: 36, label: "33–36°", color: "#fdae61" },
  { upper: 39, label: "36–39°", color: "#f46d43" },
  { upper: Number.POSITIVE_INFINITY, label: "≥39°", color: "#a50026" },
];

/** Heatwave days in the month, at the country's official threshold. */
const HEAT_DAY_BANDS: Band[] = [
  { upper: 0, label: "0", color: "#f3efe9" },
  { upper: 3, label: "1–3", color: "#fdd49e" },
  { upper: 7, label: "4–7", color: "#fc8d59" },
  { upper: 14, label: "8–14", color: "#d7301f" },
  { upper: Number.POSITIVE_INFINITY, label: "15+", color: "#7f0000" },
];

/** People per km², roughly logarithmic: rural to dense urban. */
const DENSITY_BANDS: Band[] = [
  { upper: 50, label: "<50", color: "#f1eef6" },
  { upper: 150, label: "50–150", color: "#d4b9da" },
  { upper: 300, label: "150–300", color: "#c994c7" },
  { upper: 600, label: "300–600", color: "#df65b0" },
  { upper: 1500, label: "600–1.5k", color: "#e7298a" },
  { upper: 5000, label: "1.5k–5k", color: "#ce1256" },
  { upper: Number.POSITIVE_INFINITY, label: ">5k", color: "#91003f" },
];

/** The same classes for a group that is a fraction of everyone. */
export function densityBandsFor(measure: string): Band[] {
  const scale = measure === "under5" ? 0.12 : measure === "women_15_49" ? 0.25 : 1;
  if (scale === 1) return DENSITY_BANDS;
  return DENSITY_BANDS.map((band) => ({
    ...band,
    upper: band.upper * scale,
    label: Number.isFinite(band.upper)
      ? `≤${formatCount(band.upper * scale)}`
      : `>${formatCount(DENSITY_BANDS[DENSITY_BANDS.length - 2].upper * scale)}`,
  }));
}

/** 1234 → "1.2k", 5_600_000 → "5.6M". */
export function formatCount(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}k`;
  return `${Math.round(value)}`;
}

const NO_VALUE_COLOR = "#d9d6d0";

export function bandsFor(layer: ExploreLayer): Band[] {
  if (layer === "tmax") return TEMPERATURE_BANDS;
  if (layer === "heat_days") return HEAT_DAY_BANDS;
  if (layer === "population") return DENSITY_BANDS;
  return SHARE_BANDS;
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
  if (layer === "tmax") return `${area.value_percent.toFixed(1)} °C mean daily maximum`;
  if (layer === "population")
    return `${formatCount(area.value_percent)} people per km²`;
  if (layer === "heat_days") {
    return `${Math.round(area.value_percent)} heatwave day${Math.round(area.value_percent) === 1 ? "" : "s"}`;
  }
  return `${formatPercent(area.value_percent)} linked to heat`;
}

/** Years a period code ("2041-2060") spans. */
export function periodLength(code: string): number {
  const [start, end] = code.split("-").map(Number);
  return end - start + 1;
}

/**
 * The periods shown for one length: the baseline, then non-overlapping
 * windows of that length, earliest first. Releases may publish a window for
 * every start year; listing them all buries the trend.
 */
export function periodsOfLength<T extends { period: string }>(
  rows: T[],
  length: number,
  baseline: string | null,
): T[] {
  const sorted = [...rows].sort((a, b) => a.period.localeCompare(b.period));
  const chosen: T[] = [];
  let lastEnd = -Infinity;
  for (const row of sorted) {
    if (row.period === baseline) {
      chosen.push(row);
      continue;
    }
    const [start, end] = row.period.split("-").map(Number);
    if (periodLength(row.period) !== length || start <= lastEnd) continue;
    chosen.push(row);
    lastEnd = end;
  }
  return chosen;
}

/**
 * Plain names for the scenarios offered, from least to most emissions:
 * "Low", "Medium", "High" (and "Very high" when there are four). Ranked by
 * the SSP forcing level (the number after the dash), so the words follow
 * the scenarios a release actually publishes.
 */
export function scenarioTiers(codes: string[]): Map<string, string> {
  const forcing = (code: string) => Number(code.replace(/^ssp\d/i, "")) || 0;
  const sorted = [...codes].sort((a, b) => forcing(a) - forcing(b));
  const words =
    sorted.length <= 1
      ? ["Only scenario"]
      : sorted.length === 2
        ? ["Low", "High"]
        : sorted.length === 3
          ? ["Low", "Medium", "High"]
          : ["Low", "Medium", "High", "Very high"];
  return new Map(
    sorted.map((code, index) => [code, words[Math.min(index, words.length - 1)]]),
  );
}

/** "SSP5-8.5" from "ssp585". */
export function sspLabel(code: string): string {
  const match = /^ssp(\d)(\d)(\d)$/i.exec(code);
  return match ? `SSP${match[1]}-${match[2]}.${match[3]}` : code.toUpperCase();
}

/** "2nd highest of 10" among the frame's areas with a value. */
export function rankText(areas: MapArea[], area: MapArea): string | null {
  if (area.value_percent === null) return null;
  const values = areas
    .map((item) => item.value_percent)
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a);
  if (values.length < 3) return null;
  const rank = values.indexOf(area.value_percent) + 1;
  const suffix =
    rank % 10 === 1 && rank !== 11
      ? "st"
      : rank % 10 === 2 && rank !== 12
        ? "nd"
        : rank % 10 === 3 && rank !== 13
          ? "rd"
          : "th";
  return rank === 1
    ? `Highest of ${values.length}`
    : `${rank}${suffix} highest of ${values.length}`;
}

/** [west, south, east, north] of a GeoJSON geometry. */
export function geometryBounds(
  geometry: { coordinates: unknown } | null,
): [number, number, number, number] | null {
  if (!geometry) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]);
      east = Math.max(east, value[0]);
      south = Math.min(south, value[1]);
      north = Math.max(north, value[1]);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry.coordinates);
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/**
 * Where to draw a dot for an area: the centroid of its largest polygon's outer
 * ring (shoelace formula), or that ring's first point when it is degenerate.
 */
export function centreOf(
  geometry: { type: string; coordinates: unknown } | null,
): [number, number] | null {
  if (!geometry) return null;
  const polygons = (
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  ) as number[][][][];
  if (!Array.isArray(polygons)) return null;
  let best: [number, number] | null = null;
  let bestArea = -1;
  for (const rings of polygons) {
    const ring = rings?.[0];
    if (!ring?.length) continue;
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      area += cross;
      cx += (ring[j][0] + ring[i][0]) * cross;
      cy += (ring[j][1] + ring[i][1]) * cross;
    }
    const size = Math.abs(area / 2);
    if (size > bestArea) {
      bestArea = size;
      best = area ? [cx / (3 * area), cy / (3 * area)] : [ring[0][0], ring[0][1]];
    }
  }
  return best;
}

/** Whether a [lng, lat] point lies in a GeoJSON Polygon or MultiPolygon. */
export function containsPoint(
  geometry: { type: string; coordinates: unknown } | null,
  [x, y]: [number, number],
): boolean {
  if (!geometry) return false;
  const polygons = (
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  ) as number[][][][];
  if (!Array.isArray(polygons)) return false;
  // Even-odd ray casting over every ring: holes cancel their outer ring.
  return polygons.some((rings) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
    }
    return inside;
  });
}

export type PlaceMatch = { place: ExplorePlace; context: string };

/**
 * Places matching a search, best first: names that start with the text, then
 * names with a word that does, then any match; larger areas before smaller.
 */
export function searchPlaces(
  places: ExplorePlace[],
  text: string,
  limit = 12,
): PlaceMatch[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  const byId = new Map(places.map((place) => [place.id, place]));
  const depth = (place: ExplorePlace) => place.path.split("/").filter(Boolean).length;
  return places
    .map((place) => {
      const name = place.name.toLowerCase();
      const score = name.startsWith(needle)
        ? 0
        : name.split(/[\s-]+/).some((word) => word.startsWith(needle))
          ? 1
          : name.includes(needle)
            ? 2
            : -1;
      return { place, score };
    })
    .filter((item) => item.score >= 0)
    .sort(
      (a, b) =>
        a.score - b.score ||
        depth(a.place) - depth(b.place) ||
        a.place.name.localeCompare(b.place.name),
    )
    .slice(0, limit)
    .map(({ place }) => ({ place, context: placeContext(byId, place) }));
}

/** "County · Kenya" or "District · Bhopal Division, India". */
export function placeContext(
  byId: Map<string, ExplorePlace>,
  place: ExplorePlace,
): string {
  const parent = place.parentId ? byId.get(place.parentId) : undefined;
  const country = countryOf(place)?.label;
  const within =
    parent && parent.level !== "country" && parent.name !== country
      ? `${parent.name}, ${country ?? ""}`
      : (country ?? "");
  return [place.levelLabel, within].filter(Boolean).join(" · ");
}
