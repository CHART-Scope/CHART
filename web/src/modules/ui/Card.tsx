import type { ReactNode } from "react";

import "./Card.css";

type CardProps = {
  as?: "article" | "div" | "section";
  children: ReactNode;
  className?: string;
  interactive?: boolean;
};

export function Card({
  as: Element = "div",
  children,
  className,
  interactive = false,
}: CardProps) {
  const classes = ["ui-card", interactive ? "ui-card-interactive" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return <Element className={classes}>{children}</Element>;
}
