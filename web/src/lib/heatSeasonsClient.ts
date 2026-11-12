import { authFetch } from "@/lib/authFetch";

/**
 * Typed client for heat-season calendars (Settings > Heat seasons). A
 * calendar is twelve letters from January: b before, d during, a after,
 * o outside the planning cycle.
 */

export type SeasonPhase = "b" | "d" | "a" | "o";

export type HeatSeasonCalendar = {
  geography_id: string;
  name: string;
  level_label: string;
  parent_id: string | null;
  depth: number;
  own: string | null;
  months: string | null;
  state: "custom" | "inherited" | "official" | "unset";
  inherited_from: string | null;
  source: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  HEAT_SEASON_INVALID:
    "Read from the first preparation month, the months must run before, during, after, then off, with at least one during month.",
  ROLE_NOT_ALLOWED: "Only administrators can change heat seasons.",
  GEOGRAPHY_NOT_ALLOWED: "This place is outside your planning area.",
};

async function failure(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const code = typeof body.detail === "string" ? body.detail : "";
    return new Error(ERROR_MESSAGES[code] ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function listHeatSeasons(
  signal?: AbortSignal,
): Promise<HeatSeasonCalendar[]> {
  const response = await authFetch("/api/chart/heat-seasons", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await failure(response, "Heat seasons could not load.");
  return ((await response.json()) as { items: HeatSeasonCalendar[] }).items;
}

export async function getHeatSeason(
  geographyId: string,
  signal?: AbortSignal,
): Promise<HeatSeasonCalendar> {
  const response = await authFetch(
    `/api/chart/heat-seasons/${encodeURIComponent(geographyId)}`,
    { cache: "no-store", signal },
  );
  if (!response.ok) throw await failure(response, "The heat season could not load.");
  return (await response.json()) as HeatSeasonCalendar;
}

export async function saveHeatSeason(
  geographyId: string,
  months: string,
  source: string | null,
): Promise<HeatSeasonCalendar> {
  const response = await authFetch(
    `/api/chart/heat-seasons/${encodeURIComponent(geographyId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months, source }),
    },
  );
  if (!response.ok)
    throw await failure(response, "The heat season could not be saved.");
  return (await response.json()) as HeatSeasonCalendar;
}

export async function resetHeatSeason(
  geographyId: string,
): Promise<HeatSeasonCalendar> {
  const response = await authFetch(
    `/api/chart/heat-seasons/${encodeURIComponent(geographyId)}`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw await failure(response, "The heat season could not be reset.");
  return (await response.json()) as HeatSeasonCalendar;
}
