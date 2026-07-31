"use client";

import { useMemo } from "react";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import type { GeographyRecord } from "@/lib/planningClient";
import type { PlanningSelection } from "./planningWireframe";
import styles from "./PlanningSetup.module.css";

type Props = {
  selection: PlanningSelection;
  areas: GeographyRecord[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  onChange: (selection: PlanningSelection) => void;
  onStart: () => void;
};

/**
 * The two variables in the "Mad Libs" sentence are locked to whatever
 * the deployed model supports. Today the only registered model is the
 * heat -> LBW curve for Madhya Pradesh, so the hazard is Extreme heat
 * and the health-domain framing is Maternal, newborn and child health.
 * When a second model lands, replace the constants with a fetch from
 * the model registry - the layout is already built around a menu.
 */
const DEPLOYED_HAZARD = "Extreme heat";
const DEPLOYED_HEALTH_DOMAIN = "Maternal, newborn and child health";

export function PlanningSetup({
  selection,
  areas,
  isLoading,
  isSubmitting,
  error,
  onChange,
  onStart,
}: Props) {
  const activeArea = useMemo(
    () => areas.find((area) => area.id === selection.area) ?? null,
    [areas, selection.area],
  );

  const canStart = Boolean(activeArea) && !isLoading && !isSubmitting;
  const country = activeArea ? countryFromPath(activeArea.path) : null;
  const areaName = activeArea?.name ?? "your area";

  return (
    <div className={styles.wrap}>
      {country ? (
        <div className={styles.breadcrumb} aria-label="Current geography">
          <span>{country}</span>
          <Icon name="arrow-right" size={11} />
          <strong>{areaName}</strong>
        </div>
      ) : null}

      <header className={styles.header}>
        <h1>What would you like to plan for, together?</h1>
        <p>
          Build a sentence below. CHART will generate the shared risk picture,
          recommended actions, and planning tools your departments can act on together.
        </p>
      </header>

      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          if (canStart) onStart();
        }}
      >
        <button
          type="button"
          className={styles.bookmark}
          aria-label="Save this combination"
          title="Save this combination"
          disabled
        >
          <Icon name="bookmark" size={16} />
        </button>

        <p className={styles.sentence}>
          <span>We&apos;re planning together for the impacts of </span>
          <ModelPill
            label={DEPLOYED_HAZARD}
            hint="This is the hazard the deployed model covers."
          />
          <span> on </span>
          <ModelPill
            label={DEPLOYED_HEALTH_DOMAIN}
            hint="The deployed model estimates low birth weight within maternal, newborn, and child health."
          />
          <span> in {areaName}.</span>
        </p>

        {areas.length > 1 ? (
          <label className={styles.areaSwitcher}>
            <span>Switch area</span>
            <select
              value={selection.area}
              onChange={(event) =>
                onChange({ ...selection, area: event.currentTarget.value })
              }
            >
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <div className={styles.ctaRow}>
          <p className={styles.ctaHint}>Ready to build your shared risk picture</p>
          <Button
            type="submit"
            size="md"
            disabled={!canStart}
            trailingIcon={<Icon name="arrow-right" size={14} />}
          >
            {isSubmitting ? "Opening…" : "Start planning together"}
          </Button>
        </div>
      </form>

      <section className={styles.saved} aria-labelledby="saved-scenarios">
        <h2 id="saved-scenarios">Saved scenarios</h2>
        <p>
          No saved scenarios yet. Use the bookmark icon above to save a combination you
          plan to revisit.
        </p>
      </section>
    </div>
  );
}

function ModelPill({ label, hint }: { label: string; hint: string }) {
  return (
    <span className={styles.modelPill} title={hint}>
      {label}
      <Icon name="chevron-down" size={12} />
    </span>
  );
}

function countryFromPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0]
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
