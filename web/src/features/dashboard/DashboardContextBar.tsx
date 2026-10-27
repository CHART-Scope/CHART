"use client";

import { useMemo } from "react";

import { InlineSelect } from "@/components/InlineSelect";
import { rememberActiveGeography } from "@/lib/authClient";
import { type ModelCatalogEntry } from "@/lib/planningClient";
import { useGeographies } from "@/lib/useGeographies";
import {
  computeFamilies,
  defaultAreaForFamily,
  familyContains,
  familyLabel,
  type Family,
} from "@/features/planning/contextFamilies";

import styles from "./DashboardContextBar.module.css";

export type ContextTarget = {
  geographyId: string;
  adminUnit: string | null;
  outcome: string;
};

type Props = {
  geographyScopes: string[];
  /** Top-level geography id from the dashboard URL. */
  geographyId: string;
  /** Sub-level geography id from `?admin_unit=`, or null when the user
   * is viewing the whole top-level area (e.g. "Madhya Pradesh" state). */
  adminUnit: string | null;
  /** Active outcome from the dashboard URL query. */
  outcome?: string;
  /** Model catalog for the current geography (with descendants). The
   * dashboard page already fetches this to render its panels, so we
   * accept it as a prop rather than duplicating the request. */
  catalog?: ModelCatalogEntry[];
  /** Only the place selectors: for pages that share the dashboard's place
   * but not its models (the vulnerability assessment). */
  placeOnly?: boolean;
  /** Fires when the user picks a different family, area, sub-area,
   * hazard, or outcome. Dashboard `router.push` uses this to navigate
   * the whole page in one click. */
  onNavigate: (target: ContextTarget) => void;
};

/**
 * Every dropdown the dashboard needs — country, top-level area,
 * optional sub-area, climate hazard, health outcome — laid out in one
 * horizontal bar using the same pill-styled `InlineSelect` component
 * as the panel's inline switchers. Cascading: pick a new country and
 * everything below resets; pick a new hazard and the outcome resets to
 * that hazard's first available outcome. Anything the user changes
 * routes immediately.
 */
export function DashboardContextBar({
  geographyScopes,
  geographyId,
  adminUnit,
  outcome = "",
  catalog = NO_CATALOG,
  placeOnly = false,
  onNavigate,
}: Props) {
  const { geographies } = useGeographies();

  const families = useMemo(
    () => (geographies ? computeFamilies(geographies, geographyScopes) : null),
    [geographies, geographyScopes],
  );

  const activeFamily = useMemo(() => {
    if (!families) return null;
    return (
      families.find((family) =>
        familyContains(family, geographyId, geographies ?? undefined),
      ) ??
      families[0] ??
      null
    );
  }, [families, geographies, geographyId]);

  // Walk the selected ancestry, then offer children at every level. Geography
  // metadata supplies labels, so adding a level never needs another UI branch.
  const geographyPickers = useMemo(() => {
    if (!geographies || !activeFamily) return [];
    const byId = new Map(geographies.map((geo) => [geo.id, geo]));
    const ancestors = new Set<string>();
    let cursor = byId.get(adminUnit ?? geographyId);
    while (cursor && !ancestors.has(cursor.id)) {
      ancestors.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    const pickers = [];
    let parent = activeFamily.root;
    const visited = new Set<string>();
    while (!visited.has(parent.id)) {
      visited.add(parent.id);
      const children = geographies
        .filter(
          (geo) =>
            geo.parentId === parent.id &&
            ((geo.models?.length ?? 0) > 0 ||
              geographies.some(
                (child) =>
                  child.path.startsWith(`${geo.path}/`) &&
                  (child.models?.length ?? 0) > 0,
              )),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      if (children.length === 0) break;
      const selected = children.find((geo) => ancestors.has(geo.id));
      pickers.push({
        parent,
        children,
        selected: selected?.id ?? "",
        label: children[0].levelLabel,
      });
      if (!selected) break;
      parent = selected;
    }
    return pickers;
  }, [geographies, activeFamily, geographyId, adminUnit]);

  const hazards = useMemo(
    () =>
      dedupe(
        catalog.map((entry) => ({
          value: entry.climate_hazard,
          label: entry.climate_hazard_label,
        })),
        (item) => item.value,
      ),
    [catalog],
  );
  // Memoized to match the peers `hazards` / `outcomes` — otherwise the
  // O(H·C) nested search re-runs on every parent re-render even when
  // catalog contents are unchanged (identity churn on refetch).
  const activeHazard = useMemo(
    () =>
      catalog.find((entry) => entry.outcome === outcome)?.climate_hazard ??
      hazards[0]?.value ??
      "",
    [catalog, outcome, hazards],
  );
  const outcomes = useMemo(
    () =>
      dedupe(
        catalog
          .filter((entry) => entry.climate_hazard === activeHazard)
          .map((entry) => ({
            value: entry.outcome,
            label:
              entry.batch_status === "blocked_pending_modeller_confirmation"
                ? `${entry.outcome_label} — not ready`
                : entry.outcome_label,
          })),
        (item) => item.value,
      ),
    [catalog, activeHazard],
  );

  function handleFamilyChange(nextFamilyPath: string) {
    if (!families || !geographies) return;
    const nextFamily = families.find((family) => family.root.path === nextFamilyPath);
    if (!nextFamily) return;
    const target = defaultAreaForFamily(nextFamily, geographies);
    if (!target) return;
    rememberActiveGeography(nextFamily.root.path);
    // Outcome may not exist in the new family's catalog — clear it so
    // downstream navigation lands on the first available outcome once
    // the catalog re-fetches on the new page.
    onNavigate({ geographyId: target.id, adminUnit: null, outcome: "" });
  }

  function handlePlaceChange(nextId: string, parentId: string) {
    const selected = geographies?.find((geo) => geo.id === (nextId || parentId));
    if (!selected) return;
    const hasChildren = geographies?.some((geo) => geo.parentId === selected.id);
    onNavigate({
      geographyId: hasChildren || !selected.parentId ? selected.id : selected.parentId,
      adminUnit: hasChildren || !selected.parentId ? null : selected.id,
      outcome,
    });
  }

  function handleHazardChange(nextHazard: string) {
    const nextOutcome =
      catalog.find((entry) => entry.climate_hazard === nextHazard)?.outcome ?? "";
    onNavigate({ geographyId, adminUnit, outcome: nextOutcome });
  }

  function handleOutcomeChange(nextOutcome: string) {
    onNavigate({ geographyId, adminUnit, outcome: nextOutcome });
  }

  const country = countryLabel(activeFamily);
  const showCountryDropdown = (families?.length ?? 0) > 1;

  return (
    <div
      className={styles.bar}
      role="group"
      aria-label={placeOnly ? "Place" : "Dashboard context"}
    >
      {showCountryDropdown && families ? (
        <InlineSelect
          menu
          label="Country"
          aria-label="Country"
          value={activeFamily?.root.path ?? ""}
          onChange={handleFamilyChange}
          options={families.map((family) => ({
            value: family.root.path,
            label: familyLabel(family.root),
          }))}
        />
      ) : (
        <label className={styles.staticField}>
          <span className={styles.staticLabel}>Country</span>
          <span className={styles.staticValue}>{country}</span>
        </label>
      )}

      {geographyPickers.map(({ parent, children, selected, label }) => (
        <InlineSelect
          key={parent.id}
          menu
          label={label}
          aria-label={label}
          value={selected}
          onChange={(next) => handlePlaceChange(next, parent.id)}
          options={[
            { value: "", label: `Whole ${parent.levelLabel.toLowerCase()}` },
            ...children.map((child) => ({ value: child.id, label: child.name })),
          ]}
        />
      ))}

      {placeOnly ? null : (
        <>
          <InlineSelect
            menu
            label="Climate hazard"
            aria-label="Climate hazard"
            value={activeHazard}
            onChange={handleHazardChange}
            options={hazards}
            disabled={hazards.length === 0}
          />

          <InlineSelect
            menu
            label="Health outcome"
            aria-label="Health outcome"
            value={outcome}
            onChange={handleOutcomeChange}
            options={outcomes}
            disabled={outcomes.length === 0}
          />
        </>
      )}
    </div>
  );
}

const NO_CATALOG: ModelCatalogEntry[] = [];

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function countryLabel(family: Family | null): string {
  if (!family) return "";
  const parts = family.root.path.split("/").filter(Boolean);
  if (parts.length === 0) return family.root.name;
  return parts[0]
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
