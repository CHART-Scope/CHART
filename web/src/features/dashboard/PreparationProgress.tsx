"use client";

import { type PredictionStage } from "@/lib/planningClient";

import styles from "./PreparationProgress.module.css";

/**
 * Where a queued month has got to, left to right.
 *
 * Preparing a month is two jobs with very different costs: fetching the
 * observations can take minutes and depends on an external provider, while
 * scoring them is a local call that takes seconds. A single skeleton makes
 * those look identical, so a user watching a slow download cannot tell it
 * from a stall. The two segments mirror the two steps the pipeline actually
 * runs, so this reports real progress rather than animating a guess.
 */

const STEPS = [
  { label: "Waiting to begin", stages: ["queued"] },
  { label: "Getting temperature data", stages: ["preparing_climate"] },
  { label: "Calculating your estimate", stages: ["climate_ready", "predicting"] },
] as const;

function stepState(
  index: number,
  stage: PredictionStage | null,
): "done" | "active" | "waiting" {
  if (stage === "completed") return "done";
  const activeIndex = STEPS.findIndex((step) =>
    (step.stages as readonly string[]).includes(stage ?? ""),
  );
  // An unrecognised stage leaves every step waiting rather than guessing at
  // progress that may not have happened.
  if (activeIndex < 0) return "waiting";
  if (index < activeIndex) return "done";
  return index === activeIndex ? "active" : "waiting";
}

export function PreparationProgress({
  stage,
  className,
}: {
  stage: PredictionStage | null;
  className?: string;
}) {
  const current = STEPS.findIndex((step) =>
    (step.stages as readonly string[]).includes(stage ?? ""),
  );
  const label =
    stage === "completed"
      ? "Finished"
      : current >= 0
        ? STEPS[current].label
        : stage === "waiting_for_data"
          ? "Waiting for source data to become available"
          : "Checking request status";

  return (
    <div
      className={[styles.wrap, className].filter(Boolean).join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={STEPS.length}
      aria-valuenow={stage === "completed" ? STEPS.length : Math.max(0, current)}
      aria-valuetext={label}
    >
      <div className={styles.track}>
        {STEPS.map((step, index) => (
          <div
            key={step.label}
            className={styles.segment}
            data-state={stepState(index, stage)}
          />
        ))}
      </div>
      <p className={styles.caption}>{label}…</p>
    </div>
  );
}
