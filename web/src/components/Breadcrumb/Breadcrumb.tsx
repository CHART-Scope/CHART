import { Fragment } from "react";

import styles from "./Breadcrumb.module.css";

export type Crumb = {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
};

type Props = {
  items: Crumb[];
};

export function Breadcrumb({ items }: Props) {
  return (
    <div className={styles.crumbBar}>
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={i}>
            {c.onClick || c.href ? (
              <button
                type="button"
                className={c.active ? styles.current : styles.link}
                onClick={c.onClick}
              >
                {c.label}
              </button>
            ) : (
              <span className={isLast || c.active ? styles.current : styles.static}>
                {c.label}
              </span>
            )}
            {!isLast && <span className={styles.sep}>›</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

export function BreadcrumbPill({ children }: { children: React.ReactNode }) {
  return <div className={styles.pill}>{children}</div>;
}
