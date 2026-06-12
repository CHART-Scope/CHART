import type { ReactNode } from "react";

import "./DataCard.css";

type DataCardProps = {
  eyebrow?: string;
  title?: string;
  titleLevel?: 2 | 3;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DataCard({
  eyebrow,
  title,
  titleLevel = 2,
  actions,
  children,
  className,
}: DataCardProps) {
  const TitleTag = titleLevel === 3 ? "h3" : "h2";

  return (
    <article className={`data-card panel-card${className ? ` ${className}` : ""}`}>
      {eyebrow || title || actions ? (
        <div className="data-card-head">
          <div>
            {eyebrow ? <span className="panel-eyebrow">{eyebrow}</span> : null}
            {title ? <TitleTag className="data-card-title">{title}</TitleTag> : null}
          </div>
          {actions ? <div className="data-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="data-card-body">{children}</div>
    </article>
  );
}
