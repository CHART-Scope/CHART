import type { ButtonHTMLAttributes } from "react";

import { type PrecisionLevel, precisionLabel } from "@/lib/precision";

import styles from "./PrecisionBadge.module.css";

export type { PrecisionLevel };

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  level: PrecisionLevel;
  label?: string;
};

export function PrecisionBadge({ level, label, className, ...rest }: Props) {
  const cls = [styles.badge, styles[level], className ?? ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      <span>{label ?? precisionLabel(level)}</span>
      <span className={styles.info} aria-hidden>
        i
      </span>
    </button>
  );
}
