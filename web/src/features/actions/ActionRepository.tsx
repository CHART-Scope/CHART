"use client";

import { useMemo, useState } from "react";

import { InlineSelect } from "@/components/InlineSelect";
import { Tabs } from "@/components/Tabs";

import { seasons, type Action, type Season } from "./actionCatalog";
import { ActionCard } from "./ActionCard";
import { ActionPanel } from "./ActionPanel";
import styles from "./ActionRepository.module.css";
import { timingSeason } from "./planLabels";
import { actionStatuses, statusLabels, type ActionProgress } from "./useActionProgress";

type Filters = { department: string; actionType: string; cost: string; status: string };
const noFilters: Filters = { department: "", actionType: "", cost: "", status: "" };

type Props = {
  actions: Action[];
  progress: ActionProgress;
  season: Season;
  onSeasonChange: (season: Season) => void;
  selectedId: string | null;
  onSelect: (actionId: string | null) => void;
  contextLabel: string;
};

/**
 * The action repository for the current place: every published heat action,
 * split by season and narrowed by department, type, cost and status. Opening
 * one shows its detail panel; the panel's arrows walk the list as it is currently filtered.
 */
export function ActionRepository({
  actions,
  progress,
  season,
  onSeasonChange,
  selectedId,
  onSelect,
  contextLabel,
}: Props) {
  const [filters, setFilters] = useState<Filters>(noFilters);

  const matchesFilters = (action: Action) =>
    (!filters.department || action.departments.includes(filters.department)) &&
    (!filters.actionType || action.action_types.includes(filters.actionType)) &&
    (!filters.cost || action.cost_level === filters.cost) &&
    (!filters.status || progress.statusOf(action.id) === filters.status);
  const filtered = actions.filter(matchesFilters);
  const visible = filtered.filter((action) => action.seasons.includes(season));

  const departments = useMemo(
    () => distinct(actions.flatMap((a) => a.departments)),
    [actions],
  );
  const actionTypes = useMemo(
    () => distinct(actions.flatMap((a) => a.action_types)),
    [actions],
  );
  const costs = useMemo(
    () => distinct(actions.flatMap((a) => (a.cost_level ? [a.cost_level] : []))),
    [actions],
  );

  const selected = actions.find((action) => action.id === selectedId) ?? null;
  const position = visible.findIndex((action) => action.id === selectedId);
  const step = (offset: number) =>
    onSelect(visible[(position + offset + visible.length) % visible.length].id);
  const canStep = position >= 0 && visible.length > 1;

  const filterSelect = (
    key: keyof Filters,
    label: string,
    allLabel: string,
    options: readonly { value: string; label: string }[],
  ) => (
    <InlineSelect
      aria-label={label}
      size="sm"
      value={filters[key]}
      onChange={(value) => setFilters((current) => ({ ...current, [key]: value }))}
      options={[{ value: "", label: allLabel }, ...options]}
    />
  );
  const active = Object.values(filters).some(Boolean);

  return (
    <>
      <Tabs
        ariaLabel="Heat season"
        value={season}
        onChange={onSeasonChange}
        items={seasons.map((value) => ({
          value,
          label: `${timingSeason[value]} (${filtered.filter((a) => a.seasons.includes(value)).length})`,
        }))}
      >
        <div className={styles.filters} role="group" aria-label="Filter actions">
          <span className={styles.filterLabel}>Filter by</span>
          {filterSelect(
            "department",
            "Department",
            "All departments",
            asOptions(departments),
          )}
          {filterSelect(
            "actionType",
            "Action type",
            "All action types",
            asOptions(actionTypes),
          )}
          {filterSelect("cost", "Cost level", "All cost levels", asOptions(costs))}
          {filterSelect(
            "status",
            "Status",
            "All statuses",
            actionStatuses.map((value) => ({ value, label: statusLabels[value] })),
          )}
          {active ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setFilters(noFilters)}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {visible.length > 0 ? (
          <ul className={styles.cards} aria-label={`${timingSeason[season]} actions`}>
            {visible.map((action) => (
              <li key={action.id}>
                <ActionCard
                  action={action}
                  status={progress.statusOf(action.id)}
                  selected={action.id === selectedId}
                  onOpen={() => onSelect(action.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty} role="status">
            {active
              ? `No ${timingSeason[season].toLowerCase()} actions match these filters.`
              : `No actions are recommended ${season} the heat season yet.`}
          </p>
        )}
      </Tabs>

      <ActionPanel
        action={selected}
        contextLabel={contextLabel}
        progress={progress}
        onClose={() => onSelect(null)}
        onPrevious={canStep ? () => step(-1) : undefined}
        onNext={canStep ? () => step(1) : undefined}
      />
    </>
  );
}

function distinct(values: string[]) {
  return [...new Set(values)].sort();
}

function asOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: value }));
}
