import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "icon";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

/** The button look for a link (`<a>`), so calls to action match buttons. */
export function buttonClassName({
  variant = "primary",
  size = "md",
  block = false,
}: { variant?: Variant; size?: Size; block?: boolean } = {}) {
  return [styles.btn, styles[variant], styles[size], block ? styles.block : ""]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  block,
  leadingIcon,
  trailingIcon,
  children,
  className,
  type = "button",
  ...rest
}: Props) {
  const cls = [
    styles.btn,
    styles[variant],
    styles[size],
    block ? styles.block : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
