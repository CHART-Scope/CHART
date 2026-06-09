import type { ButtonHTMLAttributes, ReactNode } from "react";

import "./Button.css";

type ButtonVariant = "primary" | "green" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  compact?: boolean;
};

export function Button({
  children,
  className,
  compact = false,
  type = "button",
  variant = "primary",
  ...buttonProps
}: ButtonProps) {
  const classes = [
    "ui-button",
    `ui-button-${variant}`,
    compact ? "ui-button-compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} type={type} {...buttonProps}>
      {children}
    </button>
  );
}
