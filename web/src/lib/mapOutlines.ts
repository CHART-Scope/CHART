import { getStoredAuthSession, onAuthSessionCleared } from "./authClient";
import type { MapArea, MapResponse } from "./dashboardClient";

/**
 * Each map frame's outlines, by area, from its first full response.
 *
 * A frame's boundaries are the same for every month, view, layer and setting,
 * so once they are held every later map of the frame is asked for values only
 * (`geometry=false`) and drawn with these: a few numbers per area instead of
 * every boundary again. Used by the dashboard map and by Explore.
 */
type Outlines = Map<number, MapArea["geometry"]>;

const STORAGE_KEY = "chart.map-outlines.v1";

// Kept in this tab's sessionStorage too, so a reload's first map is values
// only. Keys carry the user, so another user's session never reads them.
function readStored(): Map<string, Outlines> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const entries = raw
      ? (JSON.parse(raw) as [string, [number, MapArea["geometry"]][]][])
      : [];
    return new Map(entries.map(([key, areas]) => [key, new Map(areas)]));
  } catch {
    return new Map();
  }
}

function writeStored() {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...outlines].map(([key, areas]) => [key, [...areas]])),
    );
  } catch {
    // Full or blocked: the outlines in memory still serve this visit.
  }
}

const outlines: Map<string, Outlines> =
  typeof window === "undefined" ? new Map() : readStored();
// A full map in flight per frame: a second map asked for meanwhile (a tab or
// layer fetched ahead) waits for its outlines instead of fetching them again.
const pending = new Map<string, Promise<unknown>>();

export function clearMapOutlines() {
  outlines.clear();
  pending.clear();
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}

// Scoped responses differ by caller; the next user starts empty.
onAuthSessionCleared(clearMapOutlines);

function keep(key: string, response: MapResponse) {
  outlines.set(
    key,
    new Map(response.areas.map((area) => [area.admin_unit_id, area.geometry])),
  );
  writeStored();
}

/** The values laid on the kept outlines, or null when an area is new to them. */
function withOutlines<T extends MapResponse>(response: T, held: Outlines): T | null {
  if (response.areas.some((area) => !area.geometry && !held.has(area.admin_unit_id)))
    return null;
  return {
    ...response,
    areas: response.areas.map((area) =>
      area.geometry
        ? area
        : { ...area, geometry: held.get(area.admin_unit_id) ?? null },
    ),
  };
}

/**
 * Load a map of `geographyId`, values only when its outlines are held.
 * `load(geometry)` must pass `geometry` on as the request's `geometry` flag.
 * The request starts synchronously, so a map asked for in the same tick sees it.
 */
export function loadWithOutlines<T extends MapResponse>(
  geographyId: string,
  load: (geometry: boolean) => Promise<T>,
): Promise<T> {
  const key = `${getStoredAuthSession()?.user.userId ?? ""}:${geographyId}`;
  const full = () => {
    const request = load(true).then((response) => {
      keep(key, response);
      return response;
    });
    pending.set(key, request);
    void request
      .catch(() => undefined)
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
    return request;
  };
  const valuesOnly = (held: Outlines) =>
    load(false).then((values) => withOutlines(values, held) ?? full());

  const held = outlines.get(key);
  if (held) return valuesOnly(held);
  const inFlight = pending.get(key);
  if (!inFlight) return full();
  return inFlight
    .catch(() => undefined)
    .then(() => {
      const kept = outlines.get(key);
      return kept ? valuesOnly(kept) : full();
    });
}
