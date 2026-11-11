"use client";

import { useMemo, useState } from "react";

import { InlineSelect } from "@/components/InlineSelect";

import { seasons, type Action, type Season } from "./actionCatalog";
import { ActionCard } from "./ActionCard";
import { ActionGantt, type HeatSeasonLayout } from "./ActionGantt";
import { ActionPanel } from "./ActionPanel";
import styles from "./ActionRepository.module.css";
import { timingSeason } from "./planLabels";
import { actionStatuses, statusLabels, type ActionProgress } from "./useActionProgress";

type Filters = { department: string; actionType: string; cost: string; status: string };
const noFilters: Filters = { department: "", actionType: "", cost: "", status: "" };

export type ActionView = "list" | "gantt";

type Props = {
  actions: Action[];
  progress: ActionProgress;
  view: ActionView;
  /** The timeframe filter; null shows every season. */
  season: Season | null;
  onSeasonChange: (season: Season | null) => void;
  /** The place's heat-season calendar and the place it was set for. */
  heatSeason: HeatSeasonLayout;
  selectedId: string | null;
  onSelect: (actionId: string | null) => void;
  contextLabel: string;
};

/**
 * The action repository for the current place: every published heat action,
 * as a list or on the planning cycle (Gantt), narrowed by department, type,
 * cost, timeframe and status. Opening one shows its detail panel; the
 * panel's arrows walk the actions as they are currently filtered.
 */
export function ActionRepository({
  actions,
  progress,
  view,
  season,
  onSeasonChange,
  heatSeason,
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
  const visible = actions.filter(
    (action) => matchesFilters(action) && (!season || action.seasons.includes(season)),
  );

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
  const active = Object.values(filters).some(Boolean) || season !== null;

  return (
    <>
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
          "All intervention types",
          asOptions(actionTypes),
        )}
        {filterSelect("cost", "Cost level", "All cost levels", asOptions(costs))}
        <InlineSelect
          aria-label="Timeframe"
          size="sm"
          value={season ?? ""}
          onChange={(value) =>
            onSeasonChange(seasons.find((option) => option === value) ?? null)
          }
          options={[
            { value: "", label: "All timeframes" },
            ...seasons.map((value) => ({ value, label: timingSeason[value] })),
          ]}
        />
        {filterSelect(
          "status",
          "Status",
          "All status",
          actionStatuses.map((value) => ({ value, label: statusLabels[value] })),
        )}
        {active ? (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setFilters(noFilters);
              onSeasonChange(null);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty} role="status">
          {active
            ? "No actions match these filters."
            : "No actions are recommended for this place yet."}
        </p>
      ) : view === "gantt" ? (
        <ActionGantt
          actions={visible}
          statusOf={progress.statusOf}
          heatSeason={heatSeason}
          selectedId={selectedId}
          onOpen={onSelect}
        />
      ) : (
        <ul
          className={styles.cards}
          aria-label={season ? `${timingSeason[season]} actions` : "All actions"}
        >
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
      )}

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

/** The List / Gantt chart switch beside the page title. */
export function ActionViewToggle({
  view,
  onChange,
}: {
  view: ActionView;
  onChange: (view: ActionView) => void;
}) {
  return (
    <div className={styles.toggle} role="group" aria-label="View">
      {(
        [
          ["list", "List"],
          ["gantt", "Gantt chart"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            {value === "list" ? (
              <path d="M4 6h16M4 12h16M4 18h16" />
            ) : (
              <path d="M4 6h9M8 12h12M6 18h8" />
            )}
          </svg>
          {label}
        </button>
      ))}
    </div>
  );
}

function distinct(values: string[]) {
  return [...new Set(values)].sort();
}

function asOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: value }));
}
