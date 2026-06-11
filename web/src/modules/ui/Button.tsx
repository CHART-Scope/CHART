import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import "./Button.css";

export type ButtonVariant = "primary" | "green" | "danger" | "ghost";

type BaseButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  compact?: boolean;
};

type NativeButtonProps = BaseButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type AnchorButtonProps = BaseButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

type ButtonProps = NativeButtonProps | AnchorButtonProps;

export function Button(props: ButtonProps) {
  const { children, className, compact = false, variant = "primary" } = props;
  const classes = [
    "ui-button",
    `ui-button-${variant}`,
    compact ? "ui-button-compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if ("href" in props && props.href) {
    const {
      children: _children,
      className: _className,
      compact: _compact,
      variant: _variant,
      ...anchorProps
    } = props;

    return (
      <a className={classes} {...anchorProps}>
        {children}
      </a>
    );
  }

  const {
    children: _children,
    className: _className,
    compact: _compact,
    variant: _variant,
    type = "button",
    ...buttonProps
  } = props as NativeButtonProps;

  return (
    <button className={classes} type={type} {...buttonProps}>
      {children}
    </button>
  );
}
