"use client";

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
  figure = "newborn",
  contextFigure = "pregnant-woman",
  description,
}: {
  outcomeLabel?: string;
  figure?: IconName;
  contextFigure?: IconName;
  description?: string | null;
}) {
  const columns: readonly RenderedColumn[] = [
    { ...COLUMNS[0], caption: `Higher ${outcomeLabel.toLowerCase()} risk` },
    { ...COLUMNS[1], caption: `Lower ${outcomeLabel.toLowerCase()} risk` },
  ];
  return (
    <section className={styles.panel} aria-labelledby="risk-protection-heading">
      <header>
        <p className={styles.eyebrow}>Risk vs Protection</p>
      </header>
      <h2 id="risk-protection-heading" className={styles.visuallyHidden}>
        How heat exposure and protection affect {outcomeLabel.toLowerCase()}
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
            <Icon name={contextFigure} size={72} className={styles.pregnantIcon} />
            <span className={styles.arrow} aria-hidden>
              ↓
            </span>
            <Icon name={figure} size={44} className={styles.newbornIcon} />
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
