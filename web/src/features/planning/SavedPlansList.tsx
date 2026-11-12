"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, buttonClassName } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { SectionTitle } from "@/components/PageHeader";
import { riskLabels, timingSeason } from "@/features/actions";
import { dashboardHref } from "@/features/dashboard/dashboardNavigation";
import type { SavedPlan } from "@/lib/savedPlansClient";

import styles from "./SavedPlansList.module.css";

type Props = {
  /** Null while the first load is in flight. */
  plans: SavedPlan[] | null;
  error: string | null;
  onRetry: () => void;
  onRemove: (planId: string) => Promise<void>;
};

/** The user's saved plans, each reopening its dashboard view or its actions. */
export function SavedPlansList({ plans, error, onRetry, onRemove }: Props) {
  return (
    <section className={styles.saved} aria-labelledby="saved-plans">
      <SectionTitle id="saved-plans">Saved plans</SectionTitle>
      {error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : plans === null ? (
        <p className={styles.empty} role="status" aria-busy="true">
          Loading saved plans…
        </p>
      ) : plans.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="bookmark" size={18} />
          <p>
            No saved plans yet. Open the dashboard, choose an outcome and view, then use{" "}
            <strong>Save plan</strong> to keep it and its estimate here.
          </p>
        </div>
      ) : (
        <ul className={styles.list} aria-label="Saved plans">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanRow({
  plan,
  onRemove,
}: {
  plan: SavedPlan;
  onRemove: (planId: string) => Promise<void>;
}) {
  const [removal, setRemoval] = useState<"idle" | "confirm" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const { choices, figure } = plan;
  const openHref = dashboardHref({
    geographyId: plan.geography_id,
    adminUnit: plan.admin_unit_id,
    outcome: plan.outcome,
    choices: {
      view: choices.view,
      month: choices.month ?? undefined,
      scenario: choices.scenario ?? undefined,
      period: choices.period ?? undefined,
      selector: choices.selector ?? undefined,
      observedSelector: choices.observed_selector ?? undefined,
      reference: choices.reference,
    },
  });
  const actionsQuery = new URLSearchParams({ outcome: plan.outcome, plan: plan.id });
  if (plan.admin_unit_id) actionsQuery.set("admin_unit", plan.admin_unit_id);
  const actionsHref = `/dashboard/${encodeURIComponent(plan.geography_id)}/actions?${actionsQuery}`;

  async function remove() {
    setRemoval("removing");
    setError(null);
    try {
      await onRemove(plan.id);
    } catch (failure) {
      setRemoval("idle");
      setError((failure as Error).message);
    }
  }

  return (
    <li className={styles.row} aria-label={plan.name}>
      <div className={styles.body}>
        <p className={styles.name}>{plan.name}</p>
        <p className={styles.figure}>
          {figure.status === "captured" && figure.percent !== null
            ? `${figure.percent.toFixed(1)}% attributable to heat in ${figure.when}`
            : (figure.reason ?? "No estimate was captured for this plan.")}
        </p>
        <div className={styles.chips}>
          <span className={styles.chip} data-risk={plan.signals.risk_level}>
            {riskLabels[plan.signals.risk_level]}
          </span>
          <span className={styles.chip}>{timingSeason[plan.signals.timing]}</span>
          <span className={styles.meta}>Saved {formatSaved(plan.created_at)}</span>
        </div>
        {error ? (
          <p className={styles.rowError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={styles.actions}>
        <Link href={actionsHref} className={buttonClassName({ size: "sm" })}>
          Recommendations
        </Link>
        <Link
          href={openHref}
          className={buttonClassName({ variant: "secondary", size: "sm" })}
        >
          Open dashboard
        </Link>
        {removal === "idle" ? (
          <Button variant="ghost" size="sm" onClick={() => setRemoval("confirm")}>
            Remove
          </Button>
        ) : (
          <span className={styles.confirm}>
            <Button
              variant="ghost"
              size="sm"
              disabled={removal === "removing"}
              onClick={() => void remove()}
              aria-label={`Confirm removing ${plan.name}`}
            >
              {removal === "removing" ? "Removing…" : "Confirm remove"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={removal === "removing"}
              onClick={() => setRemoval("idle")}
            >
              Keep
            </Button>
          </span>
        )}
      </div>
    </li>
  );
}

function formatSaved(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
