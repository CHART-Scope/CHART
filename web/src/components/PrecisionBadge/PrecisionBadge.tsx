import type { ButtonHTMLAttributes } from "react";

import styles from "./PrecisionBadge.module.css";

export type PrecisionLevel = "high" | "moderate" | "low";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  level: PrecisionLevel;
  label?: string;
};

const DEFAULT_LABEL: Record<PrecisionLevel, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
};

export function PrecisionBadge({ level, label, className, ...rest }: Props) {
  const cls = [styles.badge, styles[level], className ?? ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      <span>{label ?? DEFAULT_LABEL[level]}</span>
      <span className={styles.info} aria-hidden>
        i
      </span>
    </button>
  );
}
