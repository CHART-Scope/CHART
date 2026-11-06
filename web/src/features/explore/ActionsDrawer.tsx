"use client";

import { useEffect, useMemo, useState } from "react";

import { type Action, HEAT_HAZARD } from "@/lib/actionsClient";

import styles from "./explore.module.css";

export function isHeatAction(action: Action): boolean {
  return action.hazards.includes(HEAT_HAZARD);
}

/**
 * The published action repository, opened over the map: heat actions first,
 * searchable, filterable by type and cost, each with its sources.
 */
export function ActionsDrawer({
  actions,
  placeName,
  planHref,
  onClose,
}: {
  actions: Action[];
  placeName: string;
  planHref: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [heatOnly, setHeatOnly] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [cost, setCost] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const categories = useMemo(
    () => [...new Set(actions.flatMap((action) => action.action_types))].sort(),
    [actions],
  );
  const costs = useMemo(
    () => [...new Set(actions.flatMap((a) => (a.cost_level ? [a.cost_level] : [])))],
    [actions],
  );
  const shown = actions.filter((action) => {
    const needle = text.trim().toLowerCase();
    return (
      (!heatOnly || isHeatAction(action)) &&
      (!category || action.action_types.includes(category)) &&
      (!cost || action.cost_level === cost) &&
      (!needle ||
        `${action.title} ${action.summary} ${action.description}`
          .toLowerCase()
          .includes(needle))
    );
  });

  return (
    <aside className={styles.drawer} aria-label="Action repository">
      <header className={styles.drawerHead}>
        <div>
          <h2>Actions to reduce heat risk</h2>
          <p>
            From the CHART action repository, for {placeName}. Choose what fits, then
            build a plan.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close actions">
          ×
        </button>
      </header>
      <div className={styles.drawerFilters}>
        <input
          type="search"
          aria-label="Search actions"
          placeholder="Search actions"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className={styles.chips} role="group" aria-label="Hazard">
          <button
            type="button"
            aria-pressed={heatOnly}
            onClick={() => setHeatOnly(true)}
          >
            Heat
          </button>
          <button
            type="button"
            aria-pressed={!heatOnly}
            onClick={() => setHeatOnly(false)}
          >
            All hazards
          </button>
        </div>
        <div className={styles.chips} role="group" aria-label="Action type">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(category === item ? null : item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className={styles.chips} role="group" aria-label="Cost">
          {costs.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={cost === item}
              onClick={() => setCost(cost === item ? null : item)}
            >
              {item === "No additional cost" ? item : `${item} cost`}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.muted} role="status">
        {shown.length} of {actions.length} actions
      </p>
      <ul className={styles.actionList}>
        {shown.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              className={styles.actionTitle}
              aria-expanded={open === action.id}
              onClick={() => setOpen(open === action.id ? null : action.id)}
            >
              <strong>{action.title}</strong>
              <span>
                {[
                  ...action.action_types,
                  action.cost_level && `Cost: ${action.cost_level}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            {open === action.id && (
              <div className={styles.actionBody}>
                <p>{action.summary || action.description}</p>
                {action.references.some((ref) => ref.url) && (
                  <p>
                    Sources:{" "}
                    {action.references
                      .filter((ref) => ref.url)
                      .map((ref, index) => (
                        <span key={ref.url}>
                          {index > 0 && ", "}
                          <a href={ref.url!} target="_blank" rel="noreferrer">
                            {hostname(ref.url!)}
                          </a>
                        </span>
                      ))}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <a className={styles.planButton} href={planHref}>
        Plan for {placeName} →
      </a>
    </aside>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
