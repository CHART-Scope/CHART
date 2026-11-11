import type { Season } from "./actionCatalog";

/**
 * A heat-season calendar: twelve letters from January, b before
 * (preparation), d during (response), a after (review), o outside the cycle.
 * Set per place in Settings > Heat seasons; this is India's official season
 * with four months of preparation, used until the place's calendar loads.
 */
export const FALLBACK_CALENDAR = "bbddddaaaabb";

const PHASE_LETTER: Record<Season, string> = { before: "b", during: "d", after: "a" };

export type PlanningCycle = {
  /** The 12 months of the cycle, oldest first, as the first of each month. */
  months: Date[];
  /** Column ranges [start, end) of each phase within those 12 months; an
   * empty range when the calendar has none of that phase. */
  phases: Record<Season, [number, number]>;
  /** Where today falls, 0–1 across the cycle, or null outside it. */
  today: number | null;
};

/**
 * The 12-month planning cycle a calendar describes, starting at its first
 * preparation month (or its season, without one): the cycle that contains
 * `now`. The server only saves calendars that run before, during, after,
 * then off from that month, so each phase is one contiguous range.
 */
export function planningCycle(calendar: string, now = new Date()): PlanningCycle {
  const letters = /^[bdao]{12}$/.test(calendar) ? calendar : FALLBACK_CALENDAR;
  const lead = letters.includes("b") ? "b" : "d";
  const startMonth = [...letters].findIndex(
    (letter, i) => letter === lead && letters[(i + 11) % 12] !== lead,
  );
  const start0 = startMonth < 0 ? 0 : startMonth;
  let year = now.getFullYear();
  if (now.getMonth() < start0) year -= 1;
  const start = new Date(year, start0, 1);
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, start0 + i, 1));
  const ordered = letters.slice(start0) + letters.slice(0, start0);
  const range = (season: Season): [number, number] => {
    const first = ordered.indexOf(PHASE_LETTER[season]);
    if (first < 0) return [0, 0];
    return [first, ordered.lastIndexOf(PHASE_LETTER[season]) + 1];
  };
  const end = new Date(year, start0 + 12, 1);
  const elapsed = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
  return {
    months,
    phases: { before: range("before"), during: range("during"), after: range("after") },
    today: elapsed >= 0 && elapsed < 1 ? elapsed : null,
  };
}

/** The columns [start, end) an action covers: from its first phase to its last. */
export function actionSpan(
  seasons: readonly Season[],
  phases: PlanningCycle["phases"],
): [number, number] | null {
  const ranges = seasons
    .map((season) => phases[season])
    .filter((range) => range && range[1] > range[0]);
  if (ranges.length === 0) return null;
  return [Math.min(...ranges.map(([s]) => s)), Math.max(...ranges.map(([, e]) => e))];
}
