import type { ReactNode } from "react";

import "./DataCard.css";

type DataCardProps = {
  eyebrow?: string;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DataCard({
  eyebrow,
  title,
  actions,
  children,
  className,
}: DataCardProps) {
  return (
    <article className={`data-card panel-card${className ? ` ${className}` : ""}`}>
      {eyebrow || title || actions ? (
        <div className="data-card-head">
          <div>
            {eyebrow ? <span className="panel-eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className="data-card-title">{title}</h2> : null}
          </div>
          {actions ? <div className="data-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="data-card-body">{children}</div>
    </article>
  );
}
