"use client";

import { type ReactNode } from "react";

import { Icon, type IconName } from "@/components/Icon";

import styles from "./RiskProtectionPanel.module.css";

type Column = {
  key: "heat" | "cool";
  toneClass: string;
  eyebrowIcon: string;
  eyebrowLabel: string;
};

type RenderedColumn = Column & { caption: string };

const COLUMNS: readonly Column[] = [
  {
    key: "heat",
    toneClass: "heat",
    eyebrowIcon: "☼",
    eyebrowLabel: "Heat exposed",
  },
  {
    key: "cool",
    toneClass: "cool",
    eyebrowIcon: "☂",
    eyebrowLabel: "Shaded / cool",
  },
];

export function RiskProtectionPanel({
  outcomeLabel = "Health outcome",
  outcomeControl,
  contextFigure = "pregnant-woman",
  description,
}: {
  outcomeLabel?: string;
  figure?: IconName;
  outcomeControl?: ReactNode;
  contextFigure?: IconName;
  description?: string | null;
}) {
  const columns: readonly RenderedColumn[] = [
    {
      ...COLUMNS[0],
      caption: `Elevated ${outcomeLabel.toLowerCase() === "low birth weight" ? "LBW" : outcomeLabel.toLowerCase()} risk`,
    },
    {
      ...COLUMNS[1],
      caption: `Reduced ${outcomeLabel.toLowerCase() === "low birth weight" ? "LBW" : outcomeLabel.toLowerCase()} risk`,
    },
  ];
  return (
    <section className={styles.panel} aria-labelledby="risk-protection-heading">
      <header>
        <p className={styles.eyebrow}>Understanding risk & prevention</p>
      </header>
      <h2 id="risk-protection-heading" className={styles.question}>
        How does extreme heat increase the risk of{" "}
        {outcomeControl ?? outcomeLabel.toLowerCase()} — and how can that risk be
        reduced?
      </h2>
      <div className={styles.figures}>
        {columns.map((column) => (
          <div
            key={column.key}
            className={`${styles.column} ${styles[column.toneClass]}`}
          >
            <span className={styles.eyebrowLabel}>
              <span className={styles.eyebrowIcon} aria-hidden>
                {column.eyebrowIcon}
              </span>
              {column.eyebrowLabel}
            </span>
            <Icon name={contextFigure} size={100} className={styles.pregnantIcon} />
            <span className={styles.population}>
              {contextFigure === "pregnant-woman"
                ? "pregnant women"
                : "children under five"}
            </span>
            <p className={styles.figureCaption}>{column.caption}</p>
          </div>
        ))}
      </div>
      <p className={styles.body}>
        {description ??
          `The fitted model estimates how climate exposure is associated with ${outcomeLabel.toLowerCase()}. It does not by itself establish causality.`}
      </p>
    </section>
  );
}
