"use client";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import type { GeographyRecord, PlanningOptions } from "@/lib/planningClient";
import {
  formatDay,
  periodDescription,
  type PlanningPeriod,
  type PlanningSelection,
} from "./planningWireframe";
import styles from "./PlanningSetup.module.css";

type Props = {
  selection: PlanningSelection;
  areas: GeographyRecord[];
  options: PlanningOptions | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  onChange: (selection: PlanningSelection) => void;
  onStart: () => void;
};

const planningPeriods: {
  value: PlanningPeriod;
  title: string;
  description: string;
}[] = [
  {
    value: "next-three-months",
    title: "Next three months",
    description: "Use the latest seasonal forecast",
  },
  {
    value: "next-hot-season",
    title: "Next hot season",
    description: "Save now if the forecast is not available yet",
  },
  {
    value: "long-term",
    title: "Long-term hot season",
    description: "Explore possible conditions in 2031–2040",
  },
  {
    value: "specific-month",
    title: "Choose a three-month period",
    description: "Set the final month and CHART fills the previous two",
  },
];

export function PlanningSetup({
  selection,
  areas,
  options,
  isLoading,
  isSubmitting,
  error,
  onChange,
  onStart,
}: Props) {
  const waiting =
    selection.period === "next-hot-season" &&
    options?.next_heat_season?.available === false;
  const needsScenario = selection.period === "long-term" && !selection.scenario;
  const hasPeriod =
    selection.period === "next-three-months" ||
    (selection.period === "next-hot-season" && Boolean(options?.next_heat_season)) ||
    (selection.period === "long-term" &&
      Boolean(options?.long_term_projection) &&
      !needsScenario) ||
    (selection.period === "specific-month" && Boolean(selection.specificMonth));
  const canSubmit =
    Boolean(selection.area && options && hasPeriod) && !isLoading && !isSubmitting;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Heat and low birth weight</div>
        <h1>Check a planning period</h1>
        <p>
          Choose the place and time. CHART retrieves the three monthly temperatures and
          checks the cumulative low-birth-weight signal.
        </p>
      </header>

      <div className={styles.layout}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onStart();
          }}
        >
          <section className={styles.section}>
            <div className={styles.stepHeading}>
              <span>1</span>
              <div>
                <h2>Where are you planning?</h2>
                <p>Only areas with an approved model are listed.</p>
              </div>
            </div>
            <Select
              id="planning-area"
              label="Area"
              fullWidth
              value={selection.area}
              disabled={areas.length === 0}
              options={areas.map((area) => ({ value: area.id, label: area.name }))}
              onChange={(event) =>
                onChange({ ...selection, area: event.currentTarget.value })
              }
            />
          </section>

          <section className={styles.section}>
            <div className={styles.stepHeading}>
              <span>2</span>
              <div>
                <h2>When are you planning for?</h2>
                <p>The available dates come from the live climate rules.</p>
              </div>
            </div>
            <div className={styles.choiceGrid}>
              {planningPeriods.map((period) => {
                const unavailable =
                  (period.value === "next-hot-season" && !options?.next_heat_season) ||
                  (period.value === "long-term" && !options?.long_term_projection);
                return (
                  <button
                    key={period.value}
                    type="button"
                    className={styles.choice}
                    aria-pressed={selection.period === period.value}
                    disabled={unavailable}
                    onClick={() => onChange({ ...selection, period: period.value })}
                  >
                    <strong>{period.title}</strong>
                    <span>{period.description}</span>
                    {selection.period === period.value ? (
                      <small>
                        {periodDescription(selection, options) || "Loading dates…"}
                      </small>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {selection.period === "specific-month" ? (
              <label className={styles.monthField}>
                <span>Final month in the three-month period</span>
                <input
                  type="month"
                  value={selection.specificMonth}
                  min={options?.custom_min_month.slice(0, 7)}
                  max={options?.custom_max_month.slice(0, 7)}
                  onChange={(event) =>
                    onChange({
                      ...selection,
                      specificMonth: event.currentTarget.value,
                    })
                  }
                />
                <small>
                  CHART includes the previous two months and chooses the correct source
                  for each month.
                </small>
              </label>
            ) : null}

            {selection.period === "long-term" && options?.long_term_projection ? (
              <Select
                id="climate-scenario"
                label="Future climate assumption"
                fullWidth
                value={selection.scenario}
                placeholder="Choose one"
                options={options.long_term_projection.scenarios}
                onChange={(event) =>
                  onChange({
                    ...selection,
                    scenario: event.currentTarget
                      .value as PlanningSelection["scenario"],
                  })
                }
              />
            ) : null}

            {waiting ? (
              <div className={styles.notice}>
                The seasonal forecast does not reach this hot season yet. Save the plan
                now and CHART will continue automatically
                {options?.next_heat_season?.available_from
                  ? ` from ${formatDay(options.next_heat_season.available_from)}`
                  : " when the forecast is published"}
                .
              </div>
            ) : null}
            {error ? (
              <div className={styles.error} role="alert">
                {error}
              </div>
            ) : null}
          </section>

          <div className={styles.submitRow}>
            <div>
              <strong>No temperature entry needed</strong>
              <span>CHART retrieves and records all three monthly values.</span>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit}
              trailingIcon={<Icon name="arrow-right" size={15} />}
            >
              {isSubmitting ? "Starting…" : waiting ? "Save plan" : "Check period"}
            </Button>
          </div>
        </form>

        <aside className={styles.aside} aria-label="What CHART will do">
          <div className={styles.asideEyebrow}>CHART will</div>
          <ol>
            <li>
              <Icon name="check" size={15} />
              Retrieve three monthly temperature values
            </li>
            <li>
              <Icon name="check" size={15} />
              Record the source, issue date, and saved record
            </li>
            <li>
              <Icon name="check" size={15} />
              Run the approved cumulative LBW model
            </li>
            <li>
              <Icon name="check" size={15} />
              Save the result so it survives a reload
            </li>
          </ol>
          <div className={styles.fixedOutcome}>
            <span>Health outcome</span>
            <strong>Low birth weight</strong>
            <small>This model currently estimates low birth weight only.</small>
          </div>
        </aside>
      </div>
    </div>
  );
}
