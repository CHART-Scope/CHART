"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import type { HeatSeasonCalendar } from "@/lib/heatSeasonsClient";

import styles from "./HeatSeasonsCard.module.css";

type Props = {
  items: HeatSeasonCalendar[];
  selectedId: string | null;
  onSelect: (geographyId: string) => void;
  stateText: (item: HeatSeasonCalendar) => string;
};

/**
 * The places of Settings > Heat seasons as a tree: parents fold their
 * children away, one button expands or collapses them all, and a search
 * shows the matching places with the parents they sit under. Countries open
 * with their first level showing.
 */
export function HeatSeasonPlaces({ items, selectedId, onSelect, stateText }: Props) {
  const [query, setQuery] = useState("");
  const parents = useMemo(
    () => new Set(items.map((item) => item.parent_id).filter(Boolean) as string[]),
    [items],
  );
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        items.filter((item) => item.depth === 0).map((item) => item.geography_id),
      ),
  );
  const byId = useMemo(
    () => new Map(items.map((item) => [item.geography_id, item])),
    [items],
  );
  const ancestors = (item: HeatSeasonCalendar) => {
    const chain: string[] = [];
    for (let id = item.parent_id; id; id = byId.get(id)?.parent_id ?? null)
      chain.push(id);
    return chain;
  };

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? (() => {
        const shown = new Set<string>();
        for (const item of items)
          if (item.name.toLowerCase().includes(needle)) {
            shown.add(item.geography_id);
            ancestors(item).forEach((id) => shown.add(id));
          }
        return items.filter((item) => shown.has(item.geography_id));
      })()
    : items.filter((item) => ancestors(item).every((id) => open.has(id)));
  const allOpen = [...parents].every((id) => open.has(id));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={styles.placesPane}>
      <div className={styles.placesTools}>
        <label className={styles.search}>
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            placeholder="Search places"
            aria-label="Search places"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.toggleAll}
          disabled={Boolean(needle) || parents.size === 0}
          onClick={() => setOpen(allOpen ? new Set() : new Set(parents))}
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {visible.length === 0 ? (
        <p className={styles.note} role="status">
          No place matches “{query.trim()}”.
        </p>
      ) : (
        <ul className={styles.places} aria-label="Places">
          {visible.map((item) => {
            const hasChildren = parents.has(item.geography_id);
            const expanded = needle ? true : open.has(item.geography_id);
            return (
              <li
                key={item.geography_id}
                className={styles.placeRow}
                aria-current={item.geography_id === selectedId || undefined}
                style={{ paddingLeft: `${6 + item.depth * 18}px` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className={styles.fold}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`}
                    disabled={Boolean(needle)}
                    onClick={() => toggle(item.geography_id)}
                  >
                    <Icon name="chevron-down" size={14} />
                  </button>
                ) : (
                  <span className={styles.foldSpace} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={styles.place}
                  onClick={() => onSelect(item.geography_id)}
                >
                  <span className={styles.placeText}>
                    <span
                      className={styles.placeName}
                      data-root={item.depth === 0 || undefined}
                    >
                      {item.name}
                      <span className={styles.level}>{item.level_label}</span>
                    </span>
                    <span className={styles.placeNote}>{stateText(item)}</span>
                  </span>
                  <span className={styles.mini} aria-hidden="true">
                    {[...(item.months ?? "oooooooooooo")].map((key, index) => (
                      <span key={index} data-phase={key} />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
