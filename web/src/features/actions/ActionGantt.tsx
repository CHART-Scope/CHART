"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { seasons, type Action } from "./actionCatalog";
import { actionSpan, planningCycle } from "./actionCycle";
import styles from "./ActionGantt.module.css";
import { PriorityAreasLine, type PriorityAreas } from "./PriorityAreas";
import { timingSeason } from "./planLabels";
import { statusLabels, type ActionStatus } from "./useActionProgress";

/** The calendar that lays out the phases, and where it was set. */
export type HeatSeasonLayout = {
  calendar: string;
  /** The place whose calendar applies (the place itself or an ancestor). */
  placeName: string | null;
};

type Props = {
  actions: Action[];
  statusOf: (actionId: string) => ActionStatus;
  heatSeason: HeatSeasonLayout;
  priority: PriorityAreas | null;
  selectedId: string | null;
  onOpen: (actionId: string) => void;
};

const MONTHS = [
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
/** Three-letter month names, as the design writes them ("Sep", not "Sept"). */
const monthFormat = { format: (date: Date) => MONTHS[date.getMonth()] };
const todayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * The actions laid out on the place's 12-month planning cycle, whose
 * before, during and after months come from Settings > Heat seasons. Each
 * card spans the phases its action is recommended for.
 */
export function ActionGantt({
  actions,
  statusOf,
  heatSeason,
  priority,
  selectedId,
  onOpen,
}: Props) {
  const now = new Date();
  const cycle = planningCycle(heatSeason.calendar, now);
  const rows = actions
    .map((action) => ({ action, span: actionSpan(action.seasons, cycle.phases) }))
    .filter(
      (row): row is { action: Action; span: [number, number] } => row.span !== null,
    )
    .sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);
  const [duringStart, duringEnd] = cycle.phases.during;
  const columns = (start: number, end: number): CSSProperties => ({
    gridColumn: `${start + 1} / ${end + 1}`,
  });
  const count = (season: "before" | "after") =>
    cycle.phases[season][1] - cycle.phases[season][0];
  const seasonMonths = `${fullMonth(cycle.months[duringStart])}–${fullMonth(cycle.months[duringEnd - 1])}`;

  return (
    <section aria-label="Gantt chart" className={styles.wrap}>
      <div className={styles.scroller}>
        <div className={styles.chart}>
          <div
            className={styles.season}
            style={{
              left: `${(duringStart / 12) * 100}%`,
              width: `${((duringEnd - duringStart) / 12) * 100}%`,
            }}
            aria-hidden="true"
          />
          {cycle.today !== null ? (
            <div
              className={styles.today}
              style={{ left: `${cycle.today * 100}%` }}
              data-testid="gantt-today"
            >
              <span>{todayFormat.format(now)}</span>
            </div>
          ) : null}
          <ol className={styles.months} aria-label="Months">
            {cycle.months.map((month, index) => (
              <li key={month.toISOString()}>
                {monthFormat.format(month)}
                {index === 0 || month.getMonth() === 0 ? ` ${month.getFullYear()}` : ""}
              </li>
            ))}
          </ol>
          <div className={styles.grid}>
            {seasons
              .filter((season) => cycle.phases[season][1] > cycle.phases[season][0])
              .map((season) => (
                <div
                  key={season}
                  className={`${styles.phase} ${styles[season]}`}
                  style={columns(...cycle.phases[season])}
                >
                  <span className={styles.phaseName}>
                    {season === "before"
                      ? "Preparation"
                      : season === "during"
                        ? "Response"
                        : "Review"}
                  </span>
                  <span className={`${styles.phasePill} ${styles[season]}`}>
                    {timingSeason[season]}
                  </span>
                </div>
              ))}
          </div>
          <ul className={styles.rows} aria-label="Actions on the planning cycle">
            {rows.map(({ action, span }) => {
              const status = statusOf(action.id);
              return (
                <li key={action.id} className={styles.grid}>
                  <button
                    type="button"
                    className={`${styles.card} ${styles[status]}`}
                    style={columns(...span)}
                    data-selected={action.id === selectedId || undefined}
                    onClick={() => onOpen(action.id)}
                    aria-label={`${action.title}, ${monthFormat.format(cycle.months[span[0]])} to ${monthFormat.format(cycle.months[span[1] - 1])}`}
                  >
                    <span className={styles.title}>{action.title}</span>
                    <span className={styles.tags}>
                      <span className={`${styles.status} ${styles[status]}`}>
                        {statusLabels[status]}
                      </span>
                      {action.departments[0] ? (
                        <span className={styles.tag}>{action.departments[0]}</span>
                      ) : null}
                    </span>
                    <PriorityAreasLine priority={priority} variant="gantt" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <p className={styles.note}>
        12-month planning cycle: {plural(count("before"))} before the heat season, the
        heat season ({seasonMonths}), and {plural(count("after"))} after. Each card
        spans the months in which the action is active — click a card for details.
        {heatSeason.placeName
          ? ` Phases follow the ${heatSeason.placeName} heat-season calendar · `
          : " "}
        <Link href="/settings?tab=seasons" className={styles.edit}>
          Edit in Settings › Heat seasons
        </Link>
      </p>
    </section>
  );
}

const FULL_MONTHS = new Intl.DateTimeFormat("en-GB", { month: "long" });

function fullMonth(date: Date): string {
  return FULL_MONTHS.format(date);
}

function plural(months: number): string {
  return `${months} month${months === 1 ? "" : "s"}`;
}
