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
  outcome: string;
  /** Model catalog for the current geography (with descendants). The
   * dashboard page already fetches this to render its panels, so we
   * accept it as a prop rather than duplicating the request. */
  catalog: ModelCatalogEntry[];
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
  outcome,
  catalog,
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

  // Top-level areas visible under the current family — i.e. the ones
  // whose parent is the family root. For India that's just Madhya
  // Pradesh; for Kenya it's each county. Everything shown here has at
  // least one active model (uncovered leaves like Turkana are already
  // filtered by the API).
  const topLevelAreas = useMemo(() => {
    if (!geographies || !activeFamily) return [];
    return geographies
      .filter((geo) => geo.parentId === activeFamily.root.id)
      .filter((geo) => (geo.models?.length ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geographies, activeFamily]);

  // Walk from the URL's geographyId up to whichever ancestor is a
  // direct child of the family root — that's the option the top-level
  // dropdown actually renders. Without this, a URL pointing at a
  // division (parentId=state, grandparent=family root) would render a
  // controlled <select value=divisionId> whose value matches no option.
  const topLevelValue = useMemo(() => {
    if (!geographies || !activeFamily) return topLevelAreas[0]?.id ?? "";
    const byId = new Map(geographies.map((geo) => [geo.id, geo]));
    let cursor = byId.get(geographyId);
    while (cursor && cursor.parentId && cursor.parentId !== activeFamily.root.id) {
      cursor = byId.get(cursor.parentId);
    }
    return cursor?.id ?? topLevelAreas[0]?.id ?? "";
  }, [geographies, activeFamily, geographyId, topLevelAreas]);

  // Sub-level areas of the resolved top-level area (state / county).
  // Only rendered when the top-level place has model-backed children —
  // MP has 10 divisions, Kenya counties have none, so the sub-dropdown
  // disappears for Kenya entirely. Uses topLevelValue (the walked
  // ancestor) rather than geographyId, so a URL that points directly
  // at a division still shows all sibling divisions in the picker.
  const subAreas = useMemo(() => {
    if (!geographies || !topLevelValue) return [];
    return geographies
      .filter((geo) => geo.parentId === topLevelValue)
      .filter((geo) => (geo.models?.length ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geographies, topLevelValue]);

  // Sub-level select value: prefer the explicit ?admin_unit= override,
  // fall back to the URL's geographyId when the URL itself points at
  // a sub-level (division). Empty string == "Whole state".
  const subLevelValue = adminUnit ?? (geographyId !== topLevelValue ? geographyId : "");

  const subLevelLabel = subAreas[0]?.levelLabel ?? "";
  const topLevelLabel =
    topLevelAreas[0]?.levelLabel ?? activeFamily?.root.levelLabel ?? "Area";

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
          .map((entry) => ({ value: entry.outcome, label: entry.outcome_label })),
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

  function handleTopLevelChange(nextGeographyId: string) {
    onNavigate({ geographyId: nextGeographyId, adminUnit: null, outcome });
  }

  function handleSubLevelChange(nextAdminUnit: string) {
    // Always anchor the URL geographyId on the resolved top-level so
    // the ?admin_unit override remains the source of truth for the
    // sub-level. Otherwise a URL that lands directly on a division
    // would keep the division as geographyId AND set admin_unit,
    // double-selecting the same place.
    onNavigate({
      geographyId: topLevelValue || geographyId,
      adminUnit: nextAdminUnit === "" ? null : nextAdminUnit,
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
    <div className={styles.bar} role="group" aria-label="Dashboard context">
      {showCountryDropdown && families ? (
        <InlineSelect
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

      <InlineSelect
        label={topLevelLabel}
        aria-label={topLevelLabel}
        value={topLevelValue}
        onChange={handleTopLevelChange}
        options={topLevelAreas.map((area) => ({
          value: area.id,
          label: area.name,
        }))}
        disabled={topLevelAreas.length === 0}
      />

      {subAreas.length > 0 ? (
        <InlineSelect
          label={subLevelLabel}
          aria-label={subLevelLabel}
          value={subLevelValue}
          onChange={handleSubLevelChange}
          options={[
            { value: "", label: `Whole ${topLevelLabel.toLowerCase()}` },
            ...subAreas.map((sub) => ({ value: sub.id, label: sub.name })),
          ]}
        />
      ) : null}

      <InlineSelect
        label="Climate hazard"
        aria-label="Climate hazard"
        value={activeHazard}
        onChange={handleHazardChange}
        options={hazards}
        disabled={hazards.length === 0}
      />

      <InlineSelect
        label="Health outcome"
        aria-label="Health outcome"
        value={outcome}
        onChange={handleOutcomeChange}
        options={outcomes}
        disabled={outcomes.length === 0}
      />
    </div>
  );
}

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
