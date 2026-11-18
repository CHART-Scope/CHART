import { Select } from "@/components/Select";
import { TextInput } from "@/components/TextInput";
import type { PlanActionChoice, PlanActions } from "@/lib/savedPlansClient";

import styles from "./ConfigurePlan.module.css";

type Props = {
  actions: PlanActions;
  /** Chosen actions by id, with their owner and due date. */
  chosen: ReadonlyMap<string, PlanActionChoice>;
  onChange: (chosen: Map<string, PlanActionChoice>) => void;
  window: { start: string; end: string } | null;
};

const PHASE_LABELS = { before: "Before", during: "During", after: "After" } as const;

/**
 * Step 4 (canvas frame 13): the action repository's actions for the plan's
 * hazard, ranked for its dates and outcomes; those inside the plan window
 * are pre-ticked. Each chosen action gets an owner and a due date.
 */
export function ActionsStep({ actions, chosen, onChange, window }: Props) {
  const recommended = actions.items.filter((item) => item.recommended);
  const others = actions.items.filter((item) => !item.recommended);
  const update = (id: string, change: Partial<PlanActionChoice> | null) => {
    const next = new Map(chosen);
    if (change === null) next.delete(id);
    else
      next.set(id, {
        ...(next.get(id) ?? {
          action_id: id,
          owner_department_id: null,
          due_date: null,
        }),
        ...change,
      });
    onChange(next);
  };
  const owners = [
    { value: "", label: "No owner yet" },
    ...actions.departments.map((department) => ({
      value: String(department.id),
      label: department.name,
    })),
  ];
  const priority = actions.priority_districts;

  return (
    <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardTitle}>
        Actions
      </h2>
      <p className={styles.cardLede}>
        Actions from the CHART action repository for this hazard, ranked for your plan:
        those that fall within your plan window are pre-selected. Tick the ones to
        include and assign an owner and a due date.
      </p>
      {[
        {
          title: `Recommended for this plan (${recommended.length})`,
          rows: recommended,
        },
        { title: `Other actions (${others.length})`, rows: others },
      ]
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <fieldset key={group.title} className={styles.actionGroup}>
            <legend className={styles.eyebrow}>{group.title}</legend>
            {group.rows.map((item) => {
              const choice = chosen.get(item.id);
              return (
                <div
                  key={item.id}
                  className={styles.actionCard}
                  data-checked={choice ? true : undefined}
                >
                  <label className={styles.actionHead}>
                    <input
                      type="checkbox"
                      className={styles.choiceInput}
                      checked={Boolean(choice)}
                      onChange={() => update(item.id, choice ? null : {})}
                    />
                    <span className={styles.choiceTitle}>{item.title}</span>
                  </label>
                  <ul className={styles.tags} aria-label={`About ${item.title}`}>
                    {item.departments.map((department) => (
                      <li key={department} className={styles.tag}>
                        {department}
                      </li>
                    ))}
                    {item.cost_level ? (
                      <li className={styles.tag}>{item.cost_level} cost</li>
                    ) : null}
                    {item.seasons.map((season) => (
                      <li key={season} className={styles.tag}>
                        {PHASE_LABELS[season]}
                      </li>
                    ))}
                  </ul>
                  <p className={styles.choiceSub}>{item.reasons.join(" ")}</p>
                  {priority.length > 0 ? (
                    <p className={styles.choiceSub}>
                      Priority districts in your selection: {priority.join(", ")}
                    </p>
                  ) : null}
                  {choice ? (
                    <div className={styles.actionFields}>
                      <Select
                        label="Owner"
                        aria-label={`Owner of ${item.title}`}
                        options={owners}
                        value={String(choice.owner_department_id ?? "")}
                        onChange={(value) =>
                          update(item.id, {
                            owner_department_id: value ? Number(value) : null,
                          })
                        }
                      />
                      <TextInput
                        id={`due-${item.id}`}
                        type="date"
                        label="Due"
                        aria-label={`Due date of ${item.title}`}
                        value={choice.due_date ?? ""}
                        min={window?.start}
                        max={window?.end}
                        onChange={(event) =>
                          update(item.id, { due_date: event.target.value || null })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        ))}
      {actions.items.length === 0 ? (
        <p className={styles.note}>
          The action repository has no actions for this hazard in this country yet.
        </p>
      ) : null}
    </section>
  );
}
