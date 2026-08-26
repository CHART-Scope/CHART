"use client";

import { useMemo } from "react";

import { InlineSelect } from "@/components/InlineSelect";
import { rememberActiveGeography } from "@/lib/authClient";
import { type GeographyRecord } from "@/lib/planningClient";
import { useGeographies } from "@/lib/useGeographies";

import {
  computeFamilies,
  defaultAreaForFamily,
  familyContains,
  familyLabel,
  type Family,
} from "./contextFamilies";
import styles from "./InlineContextSwitcher.module.css";

type Props = {
  geographyScopes: string[];
  activeGeographyId?: string;
  /** Fired the moment the user picks a different family. Receives the
   * family AND a suggested navigation target — the family root if it has
   * a direct model (e.g. Madhya Pradesh state block), or the first
   * prediction-supporting descendant (e.g. Kajiado for Kenya). The
   * caller decides how to route (dashboard push vs. planning setState). */
  onFamilyChange: (family: Family, defaultArea: GeographyRecord) => void;
  /** Small caption rendered above the pill so it matches the labelled
   * dropdowns on the dashboard context bar. Defaults to "Country". */
  label?: string;
};

/** Compact dropdown for switching between installed model families,
 * designed to sit inline in a breadcrumb or heading. No label, no
 * "Saved · applies later" toast — the caller re-routes immediately so
 * the whole page reflects the new context in the same tick.  */
export function InlineContextSwitcher({
  geographyScopes,
  activeGeographyId,
  onFamilyChange,
  label = "Country",
}: Props) {
  const { geographies } = useGeographies();

  const families = useMemo(
    () => (geographies === null ? null : computeFamilies(geographies, geographyScopes)),
    [geographies, geographyScopes],
  );

  const activeFamily = useMemo(() => {
    if (!families || !activeGeographyId) return families?.[0] ?? null;
    return (
      families.find((family) =>
        familyContains(family, activeGeographyId, geographies ?? undefined),
      ) ??
      families[0] ??
      null
    );
  }, [families, geographies, activeGeographyId]);

  if (families === null || families.length === 0) return null;

  // A single family — nothing to switch. Render the current label as a
  // labelled static value so the row stays aligned with any other
  // labelled pills next to it.
  if (families.length === 1) {
    return (
      <label className={styles.staticField}>
        <span className={styles.staticLabel}>{label}</span>
        <span className={styles.staticValue}>
          {activeFamily ? familyLabel(activeFamily.root) : families[0].root.name}
        </span>
      </label>
    );
  }

  return (
    <InlineSelect
      label={label}
      aria-label={label}
      value={activeFamily?.root.path ?? ""}
      onChange={(nextPath) => {
        const next = families.find((family) => family.root.path === nextPath);
        if (!next || !geographies) return;
        const target = defaultAreaForFamily(next, geographies);
        if (!target) return;
        rememberActiveGeography(next.root.path);
        onFamilyChange(next, target);
      }}
      options={families.map((family) => ({
        value: family.root.path,
        label: familyLabel(family.root),
      }))}
    />
  );
}
