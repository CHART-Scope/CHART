"use client";

import { useEffect, useMemo, type ReactNode } from "react";

import { Button } from "@/components/Button";
import { InlineSelect } from "@/components/InlineSelect";
import { Icon } from "@/components/Icon";
import type { GeographyRecord, ModelCatalogEntry } from "@/lib/planningClient";

import type { PlanningSelection } from "./planningWireframe";

import styles from "./PlanningSetup.module.css";

type Props = {
  selection: PlanningSelection;
  areas: GeographyRecord[];
  catalog: ModelCatalogEntry[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  onChange: (selection: PlanningSelection) => void;
  onStart: () => void;
  /** The user's saved plans, listed under the sentence. */
  savedPlans?: ReactNode;
};

export function PlanningSetup({
  selection,
  areas,
  catalog,
  isLoading,
  isSubmitting,
  error,
  onChange,
  onStart,
  savedPlans,
}: Props) {
  const activeArea = useMemo(
    () => areas.find((area) => area.id === selection.area) ?? null,
    [areas, selection.area],
  );

  // What the deployed models cover, from the area's catalog. Nothing is
  // preselected: the planner builds the sentence.
  const hazards = useMemo(
    () =>
      dedupeBy(
        catalog.map((entry) => ({
          code: entry.climate_hazard,
          label: entry.climate_hazard_label,
        })),
        (item) => item.code,
      ),
    [catalog],
  );
  const domains = useMemo(
    () =>
      dedupeBy(
        catalog
          .filter(
            (entry) => !selection.hazard || entry.climate_hazard === selection.hazard,
          )
          .map((entry) => ({
            code: entry.health_domain,
            label: entry.health_domain_label,
          })),
        (item) => item.code,
      ),
    [catalog, selection.hazard],
  );
  // The dashboard opens on the first outcome the models estimate for the
  // chosen hazard and domain (low birth weight before under-five
  // mortality); it has its own outcome picker.
  const outcome =
    catalog.find(
      (entry) =>
        entry.climate_hazard === selection.hazard &&
        entry.health_domain === selection.healthDomain,
    )?.outcome ?? "";
  useEffect(() => {
    if (selection.outcome !== outcome) onChange({ ...selection, outcome });
  }, [onChange, outcome, selection]);

  const chosen = Boolean(selection.hazard && selection.healthDomain);
  const canStart = Boolean(activeArea && outcome) && !isLoading && !isSubmitting;
  const modelUnavailable = Boolean(activeArea) && !isLoading && catalog.length === 0;
  const areaName = activeArea?.name ?? "your area";

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>What would you like to plan for, together?</h1>
        <p className={styles.lede}>
          Build a sentence below. CHART will generate the shared risk picture,
          recommended actions, and planning tools your departments can act on together.
        </p>
      </header>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (canStart) onStart();
        }}
      >
        <p className={styles.sentence}>
          We&apos;re planning together for the impacts of{" "}
          <InlineSelect
            className={styles.pill}
            aria-label="Choose a climate hazard"
            value={selection.hazard}
            onChange={(hazard) => onChange({ ...selection, hazard, healthDomain: "" })}
            options={withComingSoon(
              "choose a climate hazard",
              hazards,
              COMING_SOON_HAZARDS,
            )}
          />{" "}
          on{" "}
          <InlineSelect
            className={styles.pill}
            aria-label="Choose a health domain"
            value={selection.healthDomain}
            onChange={(healthDomain) => onChange({ ...selection, healthDomain })}
            options={withComingSoon(
              "choose a health domain",
              domains,
              COMING_SOON_DOMAINS,
            )}
          />{" "}
          in {areaName}.
        </p>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {modelUnavailable ? (
          <div className={styles.error} role="status">
            No fitted model is available for {areaName} yet. Predictions and model-based
            planning stay disabled until a model is released for it.
          </div>
        ) : null}

        <div className={styles.ctaRow}>
          <p className={styles.ctaHint} role="status">
            {chosen
              ? "Ready — CHART will build the shared risk picture for this scenario."
              : "Choose a climate hazard and health domain to continue"}
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={!canStart}
            trailingIcon={<Icon name="arrow-right" size={14} />}
          >
            {isSubmitting ? "Opening…" : "Start planning together"}
          </Button>
        </div>
      </form>

      {savedPlans}
    </div>
  );
}

/** Hazards and domains on CHART's roadmap: listed so planners see what is
 * coming, but not selectable until a model covers them. */
const COMING_SOON_HAZARDS = ["Flooding", "Air pollution"];
const COMING_SOON_DOMAINS = [
  "Vector-borne diseases",
  "Heat-related illnesses",
  "Non-communicable diseases",
];

function withComingSoon(
  placeholder: string,
  available: { code: string; label: string }[],
  comingSoon: string[],
) {
  const known = new Set(available.map((item) => item.label.toLowerCase()));
  return [
    { value: "", label: placeholder, disabled: true },
    ...available.map((item) => ({ value: item.code, label: item.label })),
    ...comingSoon
      .filter((label) => !known.has(label.toLowerCase()))
      .map((label) => ({
        value: `soon:${label}`,
        label: `${label} (coming soon)`,
        disabled: true,
      })),
  ];
}

function dedupeBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    result.push(item);
  }
  return result;
}
