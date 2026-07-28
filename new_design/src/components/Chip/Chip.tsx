import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Chip.module.css";

export type ChipTone = "default" | "behaviour" | "environment" | "policy" | "scenario";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
  compact?: boolean;
  leadingIcon?: ReactNode;
};

export function Chip({
  tone = "default",
  compact,
  leadingIcon,
  children,
  className,
  ...rest
}: Props) {
  const cls = [
    styles.chip,
    tone !== "default" ? styles[tone] : "",
    compact ? styles.tag : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      {leadingIcon}
      {children}
    </span>
  );
}
