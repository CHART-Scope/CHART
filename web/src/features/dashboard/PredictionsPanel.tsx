"use client";

import { useMemo, useState } from "react";

import { Tabs } from "@/components/Tabs";

import styles from "./PredictionsPanel.module.css";
import { LongTermView } from "./LongTermView";
import { ShortTermView } from "./ShortTermView";

type Props = {
  geographyId: string;
  adminUnit: string | null;
  accessToken?: string;
};

type TabValue = "short" | "long";

const TAB_ITEMS = [
  { value: "short" as const, label: "Short-term" },
  { value: "long" as const, label: "Long-term" },
];

export function PredictionsPanel({ geographyId, adminUnit, accessToken }: Props) {
  const [tab, setTab] = useState<TabValue>("short");

  const identity = useMemo(
    () => ({ geographyId, adminUnit, accessToken }),
    [geographyId, adminUnit, accessToken],
  );

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Predictions</p>
      </header>
      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={setTab}
        ariaLabel="Prediction time horizon"
      >
        {tab === "short" ? (
          <ShortTermView {...identity} />
        ) : (
          <LongTermView {...identity} />
        )}
      </Tabs>
    </section>
  );
}
