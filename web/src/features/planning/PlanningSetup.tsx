"use client";

import { useEffect, useMemo } from "react";

import { Button } from "@/components/Button";
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
}: Props) {
  const activeArea = useMemo(
    () => areas.find((area) => area.id === selection.area) ?? null,
    [areas, selection.area],
  );
  const switcherGroups = useMemo(() => groupAreasByCountry(areas), [areas]);
  const hasSwitcher = areas.length > 0;

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
  const selectedHazard = selection.hazard || hazards[0]?.code || "";
  const domains = useMemo(
    () =>
      dedupeBy(
        catalog
          .filter((entry) => entry.climate_hazard === selectedHazard)
          .map((entry) => ({
            code: entry.health_domain,
            label: entry.health_domain_label,
          })),
        (item) => item.code,
      ),
    [catalog, selectedHazard],
  );
  const selectedDomain = selection.healthDomain || domains[0]?.code || "";
  const outcomes = useMemo(
    () =>
      dedupeBy(
        catalog
          .filter(
            (entry) =>
              entry.climate_hazard === selectedHazard &&
              entry.health_domain === selectedDomain,
          )
          .map((entry) => ({ code: entry.outcome, label: entry.outcome_label })),
        (item) => item.code,
      ),
    [catalog, selectedDomain, selectedHazard],
  );
  const selectedOutcome = selection.outcome || outcomes[0]?.code || "";
  const selectedAreaSupportsOutcome = Boolean(
    activeArea && supportsOutcome(activeArea, selectedOutcome),
  );
  const descendantModelAreas = useMemo(
    () =>
      activeArea
        ? areas.filter(
            (area) =>
              area.path.startsWith(`${activeArea.path.replace(/\/+$/, "")}/`) &&
              supportsOutcome(area, selectedOutcome),
          )
        : [],
    [activeArea, areas, selectedOutcome],
  );
  const selectedScopeSupportsOutcome =
    selectedAreaSupportsOutcome || descendantModelAreas.length > 0;
  useEffect(() => {
    if (
      selectedHazard &&
      selectedDomain &&
      selectedOutcome &&
      (selection.hazard !== selectedHazard ||
        selection.healthDomain !== selectedDomain ||
        selection.outcome !== selectedOutcome)
    ) {
      onChange({
        ...selection,
        hazard: selectedHazard,
        healthDomain: selectedDomain,
        outcome: selectedOutcome,
      });
    }
  }, [onChange, selectedDomain, selectedHazard, selectedOutcome, selection]);
  const hazardLabel =
    hazards.find((item) => item.code === selectedHazard)?.label ?? "…";
  const domainLabel =
    domains.find((item) => item.code === selectedDomain)?.label ?? "…";
  const outcomeLabel =
    outcomes.find((item) => item.code === selectedOutcome)?.label ?? "…";

  const canStart =
    Boolean(activeArea && selectedOutcome && selectedScopeSupportsOutcome) &&
    !isLoading &&
    !isSubmitting;
  const modelUnavailable = Boolean(activeArea) && !isLoading && catalog.length === 0;
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

        {hasSwitcher ? (
          <label className={styles.areaSwitcher}>
            <span>Switch area</span>
            <select
              value={selection.area}
              onChange={(event) => {
                const area = areas.find(
                  (item) => item.id === event.currentTarget.value,
                );
                const keepsCurrentOutcome = Boolean(
                  area && supportsOutcomeInTree(area, selectedOutcome, areas),
                );
                onChange({
                  ...selection,
                  area: event.currentTarget.value,
                  hazard: keepsCurrentOutcome ? selection.hazard : "",
                  healthDomain: keepsCurrentOutcome ? selection.healthDomain : "",
                  outcome: keepsCurrentOutcome ? selection.outcome : "",
                });
              }}
            >
              {switcherGroups.map((group) => (
                <optgroup key={group.country} label={group.country}>
                  {group.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {optionLabel(area)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}

        <p className={styles.sentence}>
          <span>We&apos;re planning together for the impacts of </span>
          <PillSelect
            label={hazardLabel}
            value={selectedHazard}
            options={hazards}
            onChange={(hazard) =>
              onChange({
                ...selection,
                hazard,
                healthDomain: "",
                outcome: "",
              })
            }
            ariaLabel="Choose the climate hazard"
            hint="Hazard covered by the deployed model."
          />
          <span> on </span>
          <PillSelect
            label={domainLabel}
            value={selectedDomain}
            options={domains}
            onChange={(healthDomain) =>
              onChange({ ...selection, healthDomain, outcome: "" })
            }
            ariaLabel="Choose the health domain"
            hint="Health domain the deployed model estimates."
          />
          <span>, focusing on </span>
          <PillSelect
            label={outcomeLabel}
            value={selectedOutcome}
            options={outcomes}
            onChange={(outcome) => onChange({ ...selection, outcome })}
            ariaLabel="Choose the health outcome"
            hint="Specific outcome estimated by the deployed model."
          />
          <span> in {areaName}.</span>
        </p>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {activeArea &&
        selectedOutcome &&
        !selectedAreaSupportsOutcome &&
        descendantModelAreas.length > 0 ? (
          <div className={styles.notice} role="status">
            {outcomeLabel} is available for {descendantModelAreas.length}{" "}
            {pluralizeLevel(
              descendantModelAreas[0]?.levelLabel,
              descendantModelAreas.length,
            )}{" "}
            within {areaName}. The dashboard will open at a supported area, and you can
            switch between the other model-backed areas there.
          </div>
        ) : null}
        {activeArea && selectedOutcome && !selectedScopeSupportsOutcome ? (
          <div className={styles.error} role="status">
            {outcomeLabel} is not fitted for {areaName} or any available area below it.
          </div>
        ) : null}
        {modelUnavailable ? (
          <div className={styles.error} role="status">
            No fitted model is available for {areaName}. You can keep this county in
            your workspace, but predictions and model-based planning remain disabled
            until a compatible model mapping is released.
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

function supportsOutcome(area: GeographyRecord, outcome: string) {
  return Boolean(outcome && area.models?.some((model) => model.outcome === outcome));
}

function supportsOutcomeInTree(
  area: GeographyRecord,
  outcome: string,
  areas: GeographyRecord[],
) {
  if (supportsOutcome(area, outcome)) return true;
  const rootPath = area.path.replace(/\/+$/, "");
  return areas.some(
    (candidate) =>
      candidate.path.startsWith(`${rootPath}/`) && supportsOutcome(candidate, outcome),
  );
}

function pluralizeLevel(levelLabel: string | undefined, count: number) {
  const label = levelLabel?.toLowerCase() || "sub-area";
  return count === 1 ? label : `${label}s`;
}

function PillSelect({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  hint,
}: {
  label: string;
  value: string;
  options: { code: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
  hint: string;
}) {
  const disabled = options.length === 0;
  return (
    <span className={styles.modelPill} title={hint}>
      <span className={styles.modelPillLabel}>{label}</span>
      <Icon name="chevron-down" size={12} />
      <select
        className={styles.modelPillSelect}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
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

function countryFromPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0]
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type SwitcherGroup = { country: string; areas: GeographyRecord[] };

/**
 * Group areas by country so the switcher scales as new countries are added.
 * Within each country top-level units (state/region) sort before their
 * divisions; native <select> can only nest one level, so divisions live in
 * the same country group but are prefixed to signal the hierarchy visually.
 */
function groupAreasByCountry(areas: GeographyRecord[]): SwitcherGroup[] {
  const byCountry = new Map<string, GeographyRecord[]>();
  for (const area of areas) {
    const country = countryFromPath(area.path) ?? "Other";
    const bucket = byCountry.get(country) ?? [];
    bucket.push(area);
    byCountry.set(country, bucket);
  }
  const groups: SwitcherGroup[] = [];
  for (const [country, items] of byCountry) {
    const sorted = [...items].sort(
      (a, b) => pathDepth(a.path) - pathDepth(b.path) || a.name.localeCompare(b.name),
    );
    groups.push({ country, areas: sorted });
  }
  return groups;
}

function pathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function optionLabel(area: GeographyRecord): string {
  const suffix = ` (${area.levelLabel.toLowerCase()})`;
  return pathDepth(area.path) > 2
    ? `    ${area.name}${suffix}`
    : `${area.name}${suffix}`;
}
