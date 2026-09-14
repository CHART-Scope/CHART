import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Pill.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  leadingIcon?: ReactNode;
};

export function Pill({
  selected,
  leadingIcon,
  children,
  className,
  type = "button",
  ...rest
}: Props) {
  const cls = [styles.pill, selected ? styles.selected : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} aria-pressed={selected} {...rest}>
      {leadingIcon}
      {children}
    </button>
  );
}
