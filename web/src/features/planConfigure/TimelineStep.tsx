import { Pill } from "@/components/Pill";
import { TextInput } from "@/components/TextInput";

import { PhaseBar } from "./PhaseBar";
import {
  QUICK_WINDOWS,
  latestEnd,
  type PlanWindow,
  type QuickWindow,
  type WindowMonth,
} from "./planWindow";

import styles from "./ConfigurePlan.module.css";

type Props = {
  name: string;
  onName: (name: string) => void;
  window: PlanWindow;
  onWindow: (window: PlanWindow) => void;
  quick: QuickWindow | null;
  onQuick: (id: QuickWindow) => void;
  months: WindowMonth[];
  seasonLabel: string;
  today: string;
};

/** Step 1 (canvas frame 10): the plan's name and the dates it runs between. */
export function TimelineStep({
  name,
  onName,
  window,
  onWindow,
  quick,
  onQuick,
  months,
  seasonLabel,
  today,
}: Props) {
  return (
    <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardTitle}>
        Timeline of focus
      </h2>
      <p className={styles.cardLede}>
        Choose when the plan starts and ends. Plans run from today onwards and can cover
        up to 24 months. The bar below shows which phase of the heat season each month
        falls in.
      </p>
      <div className={styles.field}>
        <TextInput
          id="plan-name"
          label="Plan name"
          value={name}
          maxLength={120}
          onChange={(event) => onName(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <p className={styles.eyebrow} id="quick-select">
          Quick select
        </p>
        <div className={styles.quick} role="group" aria-labelledby="quick-select">
          {QUICK_WINDOWS.map((option) => (
            <Pill
              key={option.id}
              selected={quick === option.id}
              onClick={() => onQuick(option.id)}
            >
              {option.label}
            </Pill>
          ))}
        </div>
      </div>
      <div className={`${styles.field} ${styles.dates}`}>
        <TextInput
          id="plan-start"
          type="date"
          label="Start date"
          value={window.start}
          min={today}
          onChange={(event) => onWindow({ ...window, start: event.target.value })}
        />
        <TextInput
          id="plan-end"
          type="date"
          label="End date"
          value={window.end}
          min={window.start || today}
          max={window.start ? latestEnd(window.start) : undefined}
          onChange={(event) => onWindow({ ...window, end: event.target.value })}
        />
      </div>
      <p className={styles.eyebrow}>Phases covered by this window</p>
      <PhaseBar months={months} seasonLabel={seasonLabel} />
    </section>
  );
}
