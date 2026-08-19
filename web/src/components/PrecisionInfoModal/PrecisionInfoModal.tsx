"use client";

import { Modal } from "@/components/Modal";
import { PrecisionBadge } from "@/components/PrecisionBadge";
import {
  HIGH_CI_RATIO_MAX,
  MODERATE_CI_RATIO_MAX,
  type PrecisionLevel,
} from "@/lib/precision";

import styles from "./PrecisionInfoModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  activeLevel?: PrecisionLevel;
};

type Row = {
  level: PrecisionLevel;
  threshold: string;
  headline: string;
  body: string;
};

const ROWS: readonly Row[] = [
  {
    level: "high",
    threshold: `CI ratio ≤ ${HIGH_CI_RATIO_MAX}`,
    headline: "No indication of substantial imprecision",
    body: "The confidence interval is tight relative to the estimate, so the direction and size of the effect are well supported by the data.",
  },
  {
    level: "moderate",
    threshold: `${HIGH_CI_RATIO_MAX} < CI ratio ≤ ${MODERATE_CI_RATIO_MAX}`,
    headline: "Potential imprecision",
    body: "The confidence interval is wide enough that the estimate should be read as directional. Use it as guidance rather than an exact number.",
  },
  {
    level: "low",
    threshold: `CI ratio > ${MODERATE_CI_RATIO_MAX}`,
    headline: "Imprecise / wide confidence interval",
    body: "The confidence interval spans a very wide range, so we cannot rely on the point estimate. Treat this as exploratory.",
  },
];

export function PrecisionInfoModal({ open, onClose, activeLevel }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How we score precision"
      description="Precision reflects how tight the 95% confidence interval is around the effect estimate. We use the ratio of the upper to lower bound (CI ratio = high / low) so the classification does not depend on the scale of the estimate."
      wide
    >
      <ul className={styles.list}>
        {ROWS.map((row) => (
          <li
            key={row.level}
            className={styles.row}
            data-active={row.level === activeLevel || undefined}
          >
            <div className={styles.badgeCell}>
              <PrecisionBadge level={row.level} />
            </div>
            <div className={styles.body}>
              <p className={styles.headline}>{row.headline}</p>
              <p className={styles.threshold}>{row.threshold}</p>
              <p className={styles.desc}>{row.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
