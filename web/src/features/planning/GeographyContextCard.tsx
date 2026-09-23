"use client";

import { InlineSelect } from "@/components/InlineSelect";
import { useMemo, useState } from "react";

import { rememberActiveGeography } from "@/lib/authClient";
import { useGeographies } from "@/lib/useGeographies";

import {
  computeFamilies,
  familyContains,
  familyLabel,
  familyMeta,
} from "./contextFamilies";
import { SettingsCard } from "./SettingsCard";
import styles from "./GeographyContextCard.module.css";

type Props = {
  geographyScopes: string[];
  activeGeographyId?: string;
};

export function GeographyContextCard({ geographyScopes, activeGeographyId }: Props) {
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
    <SettingsCard
      eyebrow="Location"
      title="Planning location"
      headingId="geography-context-heading"
      loading={families === null}
      loadingRows={1}
      action={
        <InlineSelect
          value={activeFamily?.root.path ?? ""}
          onChange={handleChange}
          disabled={families === null || families.length === 0}
          aria-label="Active context"
          options={[
            ...(activeFamily === null
              ? [
                  {
                    value: "",
                    label:
                      families?.length === 0
                        ? "No installed models for your scope"
                        : "Choose a location",
                    disabled: true,
                  },
                ]
              : []),
            ...(families ?? []).map((family) => ({
              value: family.root.path,
              label: familyLabel(family.root),
            })),
          ]}
        />
      }
    >
      {saved ? (
        <div className={styles.row}>
          <span
            className={saved ? styles.savedShown : styles.savedHidden}
            role="status"
            aria-live="polite"
          >
            Saved · applies on next Plan / Dashboard visit
          </span>
        </div>
      ) : null}
      {activeFamily ? <p className={styles.meta}>{familyMeta(activeFamily)}</p> : null}
    </SettingsCard>
  );
}
