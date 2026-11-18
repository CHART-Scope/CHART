import { formatDay, type PlanWindow } from "./planWindow";

import styles from "./ConfigurePlan.module.css";

type Props = {
  name: string;
  window: PlanWindow | null;
  monthCount: number;
  phases: string[];
  hazardLabel: string;
  outcomeLabels: string[];
  /** Opens a step from its Edit link, or null while it cannot be opened. */
  onEdit: ((step: number) => void) | null;
};

/** The plan so far, beside every step (the canvas's plan summary). */
export function PlanSummary({
  name,
  window,
  monthCount,
  phases,
  hazardLabel,
  outcomeLabels,
  onEdit,
}: Props) {
  const edit = (step: number, label: string) =>
    onEdit ? (
      <button
        type="button"
        className={styles.edit}
        onClick={() => onEdit(step)}
        aria-label={`Edit ${label}`}
      >
        Edit
      </button>
    ) : null;
  return (
    <aside className={styles.summary} aria-label="Plan summary">
      <p className={styles.eyebrowMuted}>Plan summary</p>
      <section className={styles.summaryFirst}>
        <h2 className={styles.eyebrow}>Plan</h2>
        <p className={styles.summaryText}>{name || "Not named yet"}</p>
      </section>
      <section className={styles.summaryRow} aria-label="Timeline">
        <h2 className={styles.eyebrow}>Timeline {edit(0, "timeline")}</h2>
        {window ? (
          <>
            <p className={styles.summaryText}>
              {formatDay(window.start)} – {formatDay(window.end)}
            </p>
            <p className={styles.summaryMuted}>
              {monthCount} {monthCount === 1 ? "month" : "months"}
            </p>
            <ul className={styles.tags}>
              {phases.map((phase) => (
                <li key={phase} className={styles.tag}>
                  {phase}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.summaryMuted}>Not set yet</p>
        )}
      </section>
      <section className={styles.summaryRow} aria-label="Hazard and outcomes">
        <h2 className={styles.eyebrow}>
          Hazard &amp; outcomes {edit(1, "hazard and outcomes")}
        </h2>
        <ul className={styles.tags}>
          <li className={styles.tag}>{hazardLabel}</li>
          {outcomeLabels.map((label) => (
            <li key={label} className={styles.tag}>
              {label}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.summaryRow} aria-label="Districts">
        <h2 className={styles.eyebrow}>Districts</h2>
        <p className={styles.summaryMuted}>None selected yet</p>
      </section>
      <section className={styles.summaryRow} aria-label="Actions">
        <h2 className={styles.eyebrow}>Actions</h2>
        <p className={styles.summaryMuted}>None chosen yet</p>
      </section>
    </aside>
  );
}
