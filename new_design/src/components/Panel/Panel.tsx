import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Panel.module.css";

type Variant = "default" | "muted" | "inverse" | "accent";
type Pad = "sm" | "md" | "lg";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  pad?: Pad;
  eyebrow?: ReactNode;
  title?: ReactNode;
};

const padCls = { sm: "padSm", md: "padMd", lg: "padLg" } as const;

export function Panel({
  variant = "default",
  pad = "md",
  eyebrow,
  title,
  children,
  className,
  ...rest
}: Props) {
  const cls = [
    styles.panel,
    variant !== "default" ? styles[variant] : "",
    styles[padCls[pad]],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
      {title && <div className={styles.title}>{title}</div>}
      {children}
    </div>
  );
}
