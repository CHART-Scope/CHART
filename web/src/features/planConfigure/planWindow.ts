import type { SeasonPhase } from "@/lib/heatSeasonsClient";

/**
 * Dates for the Configure plan timeline. Days are ISO strings (YYYY-MM-DD)
 * in the planner's local calendar, the form the API stores; the API checks
 * the same rules (from today, end on or after start, under 24 months).
 */

export const MAX_PLAN_MONTHS = 24;

export type QuickWindow = "cycle" | "heat" | "m6" | "m12";

export const QUICK_WINDOWS: { id: QuickWindow; label: string }[] = [
  { id: "cycle", label: "Next planning cycle" },
  { id: "heat", label: "Heat season only" },
  { id: "m6", label: "Next 6 months" },
  { id: "m12", label: "Next 12 months" },
];

export type PlanWindow = { start: string; end: string };

export type WindowMonth = { month: Date; phase: SeasonPhase };

export function isoDay(day: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addMonths(day: Date, months: number): Date {
  const target = new Date(day.getFullYear(), day.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(day.getDate(), last),
  );
}

function addDays(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

function monthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/** The last day a plan starting on `start` may end on. */
export function latestEnd(start: string): string {
  return isoDay(addDays(addMonths(parseDay(start), MAX_PLAN_MONTHS), -1));
}

/**
 * The window a quick-select button picks, from today. The planning cycle and
 * heat season come from the place's calendar (twelve letters from January):
 * the next heat season, or the current one while it is under way, and for
 * the cycle the review months after it.
 */
export function quickWindow(
  id: QuickWindow,
  calendar: string,
  today: Date,
): PlanWindow {
  const start = isoDay(today);
  if (id === "m6" || id === "m12") {
    const months = id === "m6" ? 6 : 12;
    return { start, end: isoDay(addDays(addMonths(today, months), -1)) };
  }
  const phaseAt = (offset: number) => calendar[(today.getMonth() + offset) % 12];
  // Months from now: the season's first and last month, then its last review month.
  let first = 0;
  if (phaseAt(0) !== "d") {
    first = 1;
    while (first < 12 && phaseAt(first) !== "d") first += 1;
  }
  let last = first;
  while (last < first + 11 && phaseAt(last + 1) === "d") last += 1;
  let review = last;
  while (review < last + 11 && phaseAt(review + 1) === "a") review += 1;
  const endOf = (offset: number) =>
    isoDay(monthEnd(today.getFullYear(), today.getMonth() + offset));
  if (id === "cycle") return { start, end: endOf(review) };
  const seasonStart =
    first === 0 ? today : new Date(today.getFullYear(), today.getMonth() + first, 1);
  return { start: isoDay(seasonStart), end: endOf(last) };
}

/** Which quick select, if any, a window matches. */
export function matchingQuickWindow(
  window: PlanWindow,
  calendar: string,
  today: Date,
): QuickWindow | null {
  const match = QUICK_WINDOWS.find(({ id }) => {
    const candidate = quickWindow(id, calendar, today);
    return candidate.start === window.start && candidate.end === window.end;
  });
  return match?.id ?? null;
}

/** Each month the window touches, with its heat-season phase. */
export function windowMonths(window: PlanWindow, calendar: string): WindowMonth[] {
  const start = parseDay(window.start);
  const end = parseDay(window.end);
  if (end < start) return [];
  const months: WindowMonth[] = [];
  for (
    let month = new Date(start.getFullYear(), start.getMonth(), 1);
    month <= end && months.length < MAX_PLAN_MONTHS + 1;
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  ) {
    months.push({ month, phase: (calendar[month.getMonth()] ?? "o") as SeasonPhase });
  }
  return months;
}

/** Why a window cannot be saved, or null when it can. */
export function windowProblem(window: PlanWindow, today: Date): string | null {
  if (!window.start || !window.end) return "Choose a start and an end date.";
  if (window.start < isoDay(today))
    return "A plan starts today or later. Choose a later start date.";
  if (window.end < window.start)
    return "Choose an end date on or after the start date.";
  if (window.end > latestEnd(window.start))
    return "A plan can cover up to 24 months. Choose an earlier end date.";
  return null;
}

export function formatDay(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDay(value));
}
