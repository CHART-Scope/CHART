"use client";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
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

export function PlanningSetup({
  selection,
  areas,
  isLoading,
  isSubmitting,
  error,
  onChange,
  onStart,
}: Props) {
  const canSubmit = Boolean(selection.area) && !isLoading && !isSubmitting;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Heat and low birth weight</div>
        <h1>Choose an area to open its dashboard</h1>
        <p>
          Pick the place you are planning for. The dashboard shows the Short-term
          seasonal outlook and the Long-term projection side by side.
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
            {error ? (
              <div className={styles.error} role="alert">
                {error}
              </div>
            ) : null}
          </section>

          <div className={styles.submitRow}>
            <div>
              <strong>Time horizon is chosen on the dashboard</strong>
              <span>
                Switch between the Short-term and Long-term tabs once the dashboard is open.
              </span>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit}
              trailingIcon={<Icon name="arrow-right" size={15} />}
            >
              {isSubmitting ? "Opening…" : "Open dashboard"}
            </Button>
          </div>
        </form>

        <aside className={styles.aside} aria-label="What CHART will do">
          <div className={styles.asideEyebrow}>On the dashboard you will see</div>
          <ol>
            <li>
              <Icon name="check" size={15} />
              Short-term seasonal outlook with 3 and 6 month cards
            </li>
            <li>
              <Icon name="check" size={15} />
              Long-term projections under three RCP scenarios
            </li>
            <li>
              <Icon name="check" size={15} />
              Confidence bands showing forecast uncertainty
            </li>
            <li>
              <Icon name="check" size={15} />
              Modeled numbers labelled with their source
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
