"use client";

import { useId, useState, type FormEvent } from "react";

import { districtFill, type PriorityDistrict } from "./actionCatalog";
import styles from "./AssignDistrictsForm.module.css";
import { type Assignment } from "./useActionProgress";

const assignees = [
  "District Health Officer",
  "District Collector",
  "RCH Officer",
  "Sub-County Health Management Team",
];

type Props = {
  districts: PriorityDistrict[];
  initial: Assignment | null;
  onCancel: () => void;
  onSave: (assignment: Assignment) => void;
};

/** Picks districts for follow-up; the highest-risk ones start selected. */
export function AssignDistrictsForm({ districts, initial, onCancel, onSave }: Props) {
  const id = useId();
  const [selected, setSelected] = useState<string[]>(
    initial?.districts ??
      districts.filter((item) => item.percent > 10).map((item) => item.district),
  );
  const [assignee, setAssignee] = useState(initial?.assignee ?? assignees[0]);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function toggle(district: string) {
    setSelected((current) =>
      current.includes(district)
        ? current.filter((name) => name !== district)
        : [...current, district],
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (selected.length === 0) return;
    // Keep the ranking order rather than the order they were ticked.
    const ordered = districts
      .map((item) => item.district)
      .filter((name) => selected.includes(name));
    onSave({ districts: ordered, assignee, dueDate, notes: notes.trim() });
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Assign to districts">
      <fieldset className={styles.districts}>
        <legend className={styles.legend}>
          Select districts to assign for follow-up
        </legend>
        {districts.map((item) => (
          <label key={item.district} className={styles.district}>
            <input
              type="checkbox"
              checked={selected.includes(item.district)}
              onChange={() => toggle(item.district)}
            />
            <span
              className={styles.dot}
              style={{ background: districtFill(item.percent) }}
            />
            {item.district} district
            <span className={styles.percent}>{item.percent}%</span>
          </label>
        ))}
      </fieldset>

      <label className={styles.field} htmlFor={`${id}-assignee`}>
        Assign to
      </label>
      <select
        id={`${id}-assignee`}
        className={styles.input}
        value={assignee}
        onChange={(event) => setAssignee(event.target.value)}
      >
        {assignees.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>

      <label className={styles.field} htmlFor={`${id}-due`}>
        Due date
      </label>
      <input
        id={`${id}-due`}
        type="date"
        className={styles.input}
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />

      <label className={styles.field} htmlFor={`${id}-notes`}>
        Notes (optional)
      </label>
      <textarea
        id={`${id}-notes`}
        className={styles.input}
        rows={3}
        value={notes}
        placeholder="e.g. Prioritise ASHA outreach training before onset of pre-monsoon heat."
        onChange={(event) => setNotes(event.target.value)}
      />

      {selected.length === 0 ? (
        <p className={styles.hint} role="status">
          Select at least one district to assign.
        </p>
      ) : null}
      <div className={styles.buttons}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles.confirm}
          disabled={selected.length === 0}
        >
          Assign to selected districts
        </button>
      </div>
    </form>
  );
}
