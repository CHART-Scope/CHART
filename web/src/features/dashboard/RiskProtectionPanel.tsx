"use client";

import { Icon } from "@/components/Icon";

import styles from "./RiskProtectionPanel.module.css";

type Column = {
  key: "heat" | "cool";
  toneClass: string;
  eyebrowIcon: string;
  eyebrowLabel: string;
  caption: string;
};

const COLUMNS: readonly Column[] = [
  {
    key: "heat",
    toneClass: "heat",
    eyebrowIcon: "☼",
    eyebrowLabel: "Heat exposed",
    caption: "Low birth weight",
  },
  {
    key: "cool",
    toneClass: "cool",
    eyebrowIcon: "☂",
    eyebrowLabel: "Shaded / cool",
    caption: "Typical birth weight",
  },
];

export function RiskProtectionPanel() {
  return (
    <section className={styles.panel} aria-labelledby="risk-protection-heading">
      <header>
        <p className={styles.eyebrow}>Risk vs Protection</p>
      </header>
      <h2 id="risk-protection-heading" className={styles.visuallyHidden}>
        How heat exposure and shade affect birth weight
      </h2>
      <div className={styles.figures}>
        {COLUMNS.map((column) => (
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
            <Icon name="pregnant-woman" size={72} className={styles.pregnantIcon} />
            <span className={styles.arrow} aria-hidden>
              ↓
            </span>
            <Icon name="newborn" size={44} className={styles.newbornIcon} />
            <p className={styles.figureCaption}>{column.caption}</p>
          </div>
        ))}
      </div>
      <p className={styles.body}>
        Exposure to extreme heat during pregnancy directly increases the risk of a baby
        being born with low birth weight (LBW), while maintaining a cooler environment
        significantly reduces this risk.
      </p>
    </section>
  );
}
