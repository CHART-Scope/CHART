"use client";

import { FillFigure } from "@/components/FillFigure";

import styles from "./RiskProtectionPanel.module.css";

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
        <div className={styles.figure}>
          <FillFigure
            figure="mother-baby"
            value={82}
            color="var(--color-maroon, #7a1a4a)"
            unfilledColor="var(--color-grey-mid, #cccccc)"
            size={110}
            label={
              <span className={styles.figureLabel}>
                <span className={styles.sunIcon} aria-hidden>
                  ☼
                </span>
                Heat exposed
              </span>
            }
          />
          <p className={styles.figureCaption}>Low birth weight</p>
        </div>
        <div className={styles.figure}>
          <FillFigure
            figure="mother-baby"
            value={22}
            color="var(--color-nexus, #3455d8)"
            unfilledColor="var(--color-grey-mid, #cccccc)"
            size={110}
            label={
              <span className={styles.figureLabel}>
                <span className={styles.shadeIcon} aria-hidden>
                  ☂
                </span>
                Shaded / cool
              </span>
            }
          />
          <p className={styles.figureCaption}>Typical birth weight</p>
        </div>
      </div>
      <p className={styles.body}>
        Exposure to extreme heat during pregnancy directly increases the risk of a baby
        being born with low birth weight (LBW), while maintaining a cooler environment
        significantly reduces this risk.
      </p>
    </section>
  );
}
