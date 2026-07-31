"use client";

import { useMemo, useState } from "react";

import { Tabs } from "@/components/Tabs";

import styles from "./PredictionsPanel.module.css";
import { LongTermView } from "./LongTermView";
import { ShortTermView } from "./ShortTermView";
import { useAutoPrediction, type AutoPredictionPhase } from "./useAutoPrediction";

type Props = {
  geographyId: string;
  adminUnit: string | null;
  accessToken: string;
};

type TabValue = "short" | "long";

const TAB_ITEMS = [
  { value: "short" as const, label: "Short-term" },
  { value: "long" as const, label: "Long-term" },
];

const PHASE_LABEL: Record<AutoPredictionPhase, string> = {
  idle: "",
  submitting: "Submitting today's prediction…",
  queued: "Queued — waiting for climate data",
  running: "Running the LBW model…",
  completed: "Latest prediction ready",
  failed: "Latest prediction failed",
};

export function PredictionsPanel({ geographyId, adminUnit, accessToken }: Props) {
  const [tab, setTab] = useState<TabValue>("short");
  const auto = useAutoPrediction({ geographyId, accessToken });

  const identity = useMemo(
    () => ({ geographyId, adminUnit, accessToken }),
    [geographyId, adminUnit, accessToken],
  );

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Predictions</p>
        <AutoPredictionStatus phase={auto.phase} stage={auto.stage} />
      </header>
      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={setTab}
        ariaLabel="Prediction time horizon"
      >
        {tab === "short" ? (
          <ShortTermView {...identity} refreshKey={auto.completedAt} />
        ) : (
          <LongTermView {...identity} refreshKey={auto.completedAt} />
        )}
      </Tabs>
    </section>
  );
}


function AutoPredictionStatus({
  phase,
  stage,
}: {
  phase: AutoPredictionPhase;
  stage: string | null;
}) {
  if (phase === "idle") return null;
  const label = PHASE_LABEL[phase];
  const showSpinner =
    phase === "submitting" || phase === "queued" || phase === "running";
  return (
    <p
      className={styles.status}
      data-phase={phase}
      role={phase === "failed" ? "alert" : "status"}
    >
      {showSpinner ? <span className={styles.dot} aria-hidden /> : null}
      {label}
      {stage && showSpinner ? ` · ${stage.replace(/_/g, " ")}` : null}
    </p>
  );
}
