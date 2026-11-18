import type { SeasonPhase } from "@/lib/heatSeasonsClient";

import type { WindowMonth } from "./planWindow";

import styles from "./ConfigurePlan.module.css";

export const PHASE_NAMES: Record<Exclude<SeasonPhase, "o">, string> = {
  b: "Before heat season",
  d: "During heat season",
  a: "After heat season",
};

// en-GB abbreviates September "Sept"; the bar uses three letters throughout.
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

const PHASE_CLASS: Record<SeasonPhase, string> = {
  b: styles.before,
  d: styles.during,
  a: styles.after,
  o: styles.outside,
};

/** The phases a window's months fall in, in season order. */
export function phasesCovered(months: WindowMonth[]): string[] {
  return (["b", "d", "a"] as const)
    .filter((phase) => months.some((month) => month.phase === phase))
    .map((phase) => PHASE_NAMES[phase]);
}

/** One cell per month of the plan, coloured by its heat-season phase. */
export function PhaseBar({
  months,
  seasonLabel,
}: {
  months: WindowMonth[];
  seasonLabel: string;
}) {
  return (
    <div>
      <ol className={styles.phaseBar} aria-label="Heat-season phase of each month">
        {months.map(({ month, phase }, index) => {
          const year = index === 0 || month.getMonth() === 0;
          const name = MONTHS[month.getMonth()];
          return (
            <li
              key={month.toISOString()}
              className={`${styles.phaseMonth} ${PHASE_CLASS[phase]}`}
              aria-label={`${month.toLocaleString("en-GB", { month: "long", year: "numeric" })}: ${phase === "o" ? "outside the planning cycle" : PHASE_NAMES[phase].toLowerCase()}`}
              data-phase={phase}
            >
              {name}
              {year ? <span>{month.getFullYear()}</span> : null}
            </li>
          );
        })}
      </ol>
      <ul className={styles.legend}>
        {(["b", "d", "a"] as const).map((phase) => (
          <li key={phase}>
            <span className={`${styles.swatch} ${PHASE_CLASS[phase]}`} aria-hidden />
            {phase === "d" ? `${PHASE_NAMES.d} (${seasonLabel})` : PHASE_NAMES[phase]}
          </li>
        ))}
      </ul>
    </div>
  );
}
