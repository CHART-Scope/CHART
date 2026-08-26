"use client";

import { useMemo, useState } from "react";

import { rememberActiveGeography } from "@/lib/authClient";
import { useGeographies } from "@/lib/useGeographies";

import {
  computeFamilies,
  familyContains,
  familyLabel,
  familyMeta,
} from "./contextFamilies";
import styles from "./GeographyContextCard.module.css";

type Props = {
  geographyScopes: string[];
  activeGeographyId?: string;
  /** Compact rendering — trims the subtitle and metadata line so the
   * card fits above the plan/dashboard content without dominating the
   * page. Full presentation is used on Settings. */
  compact?: boolean;
};

export function GeographyContextCard({
  geographyScopes,
  activeGeographyId,
  compact = false,
}: Props) {
  const { geographies } = useGeographies();
  const families = useMemo(
    () => (geographies ? computeFamilies(geographies, geographyScopes) : null),
    [geographies, geographyScopes],
  );
  const [current, setCurrent] = useState<string>(activeGeographyId ?? "");
  const [saved, setSaved] = useState(false);

  const activeFamily = useMemo(
    () => (families ?? []).find((family) => familyContains(family, current)) ?? null,
    [families, current],
  );

  function handleChange(value: string) {
    const family = (families ?? []).find((f) => f.root.path === value);
    if (!family || family.root.path === current) return;
    rememberActiveGeography(family.root.path);
    setCurrent(family.root.path);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  return (
    <section className={styles.card} data-compact={compact || undefined}>
      <div className={styles.header}>
        <p className={styles.title}>Context</p>
        {compact ? null : (
          <p className={styles.subtitle}>
            The place CHART plans and predicts for. Only areas we have installed models
            for appear here.
          </p>
        )}
      </div>
      <div className={styles.row}>
        <select
          className={styles.select}
          value={activeFamily?.root.path ?? ""}
          onChange={(event) => handleChange(event.currentTarget.value)}
          disabled={families === null || families.length === 0}
          aria-label="Active context"
        >
          {families === null ? (
            <option value="">Loading…</option>
          ) : families.length === 0 ? (
            <option value="">No installed models for your scope</option>
          ) : (
            <>
              {activeFamily === null ? (
                <option value="" disabled>
                  Choose a context
                </option>
              ) : null}
              {families.map((family) => (
                <option key={family.root.id} value={family.root.path}>
                  {familyLabel(family.root)}
                </option>
              ))}
            </>
          )}
        </select>
        <span
          className={saved ? styles.savedShown : styles.savedHidden}
          role="status"
          aria-live="polite"
        >
          Saved · applies on next Plan / Dashboard visit
        </span>
      </div>
      {activeFamily && !compact ? (
        <p className={styles.meta}>{familyMeta(activeFamily)}</p>
      ) : null}
    </section>
  );
}
