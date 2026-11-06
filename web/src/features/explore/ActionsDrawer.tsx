"use client";

import { useEffect, useMemo, useState } from "react";

import type { RecommendedAction } from "@/lib/planningClient";

import styles from "./explore.module.css";

/** Hazards that make an action relevant to heat and health. */
export const HEAT_HAZARDS = ["Extreme heat", "Increased temperature", "Heatwave"];

export function isHeatAction(action: RecommendedAction): boolean {
  return action.hazards.some((hazard) => HEAT_HAZARDS.includes(hazard));
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
  actions: RecommendedAction[];
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
    () => [...new Set(actions.flatMap((action) => action.categories))].sort(),
    [actions],
  );
  const shown = actions.filter((action) => {
    const needle = text.trim().toLowerCase();
    return (
      (!heatOnly || isHeatAction(action)) &&
      (!category || action.categories.includes(category)) &&
      (!cost || action.cost === cost) &&
      (!needle ||
        `${action.title} ${action.description}`.toLowerCase().includes(needle))
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
          {(["low", "medium", "high"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={cost === item}
              onClick={() => setCost(cost === item ? null : item)}
            >
              {item[0].toUpperCase() + item.slice(1)} cost
            </button>
          ))}
        </div>
      </div>
      <p className={styles.muted} role="status">
        {shown.length} of {actions.length} actions
      </p>
      <ul className={styles.actionList}>
        {shown.map((action) => (
          <li key={action.slug}>
            <button
              type="button"
              className={styles.actionTitle}
              aria-expanded={open === action.slug}
              onClick={() => setOpen(open === action.slug ? null : action.slug)}
            >
              <strong>{action.title}</strong>
              <span>
                {[...action.categories, action.cost && `${action.cost} cost`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            {open === action.slug && (
              <div className={styles.actionBody}>
                <p>{action.description}</p>
                {action.links.length > 0 && (
                  <p>
                    Sources:{" "}
                    {action.links.map((link, index) => (
                      <span key={link.url}>
                        {index > 0 && ", "}
                        <a href={link.url} target="_blank" rel="noreferrer">
                          {link.label}
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
