"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import {
  fetchPlanRecommendations,
  type PlanRecommendationResult,
} from "@/lib/recommendationsClient";
import type { SavedPlan } from "@/lib/savedPlansClient";

import type { Action } from "./actionCatalog";
import { planFigureSentence, riskLabels, timingSeason } from "./planLabels";
import styles from "./PlanRecommendations.module.css";

type Props = {
  plan: SavedPlan;
  actions: Action[];
  outcomeLabel: string;
  onOpen: (actionId: string) => void;
};

/**
 * What to do first for one saved plan: the figure it was saved with, the
 * published actions the API ranks highest for the plan's country with the
 * reasons they rank, and the insight beside them, labelled by what wrote it.
 */
export function PlanRecommendations({ plan, actions, outcomeLabel, onOpen }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; result: PlanRecommendationResult }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchPlanRecommendations(plan.id, controller.signal)
      .then((result) => setState({ status: "ready", result }))
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setState({ status: "error", message: error.message });
      });
    return () => controller.abort();
  }, [attempt, plan.id]);

  const titles = new Map(actions.map((action) => [action.id, action.title]));
  const season = timingSeason[plan.signals.timing];
  return (
    <section className={styles.panel} aria-labelledby="plan-recommendations">
      <p className={styles.eyebrow}>Recommended for your plan</p>
      <h2 id="plan-recommendations" className={styles.title}>
        {plan.name}
      </h2>
      <p className={styles.figure} data-testid="plan-figure">
        {planFigureSentence(plan, outcomeLabel)}
      </p>
      <div className={styles.chips}>
        <span className={styles.chip} data-risk={plan.signals.risk_level}>
          {riskLabels[plan.signals.risk_level]}
        </span>
        <span className={styles.chip}>{season}</span>
        {plan.figure.release ? (
          <span className={styles.chip}>Model release {plan.figure.release}</span>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <p className={styles.status} role="status" aria-busy="true">
          Ranking actions for this plan…
        </p>
      ) : state.status === "error" ? (
        <div className={styles.error} role="alert">
          <p>{state.message}</p>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {state.result.items.length === 0 ? (
            <p className={styles.status} role="status">
              No published heat action applies to this plan&apos;s country yet.
            </p>
          ) : null}
          <ol className={styles.list} aria-label="Recommended actions for this plan">
            {state.result.items.map(({ id, reasons }, index) => (
              <li key={id} className={styles.item}>
                <span className={styles.rank}>{index + 1}</span>
                <div className={styles.body}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => onOpen(id)}
                  >
                    {titles.get(id) ?? id}
                  </button>
                  <ul className={styles.reasons}>
                    {reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
          <p className={styles.source}>
            Ranked by{" "}
            {state.result.ranker === "classifier"
              ? `the classifier${state.result.ranker_model ? ` (${state.result.ranker_model})` : ""}`
              : "season, outcome and cost rules"}
            .{state.result.ranker_note ? ` ${state.result.ranker_note}` : ""}
          </p>
          <Insight insight={state.result.insight} />
        </>
      )}
    </section>
  );
}

function Insight({ insight }: { insight: PlanRecommendationResult["insight"] }) {
  return (
    <aside className={styles.insight} aria-label="AI insight">
      <p className={styles.insightHead}>
        <Icon name="info-circle" size={14} />
        AI insight{" "}
        <span className={styles.badge}>
          {insight.generated ? (insight.model ?? insight.provider) : "Placeholder"}
        </span>
      </p>
      <p className={styles.insightText}>{insight.text}</p>
      <p className={styles.insightNote}>
        {insight.generated
          ? `Written by ${insight.model} from the figure and ranking above; check it against them.`
          : "Written from a template, not by an AI model."}{" "}
        {insight.note ?? ""} The figure and ranking above do not depend on it.
      </p>
    </aside>
  );
}
