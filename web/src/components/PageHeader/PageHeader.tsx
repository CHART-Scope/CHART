import type { ReactNode } from "react";

import styles from "./PageHeader.module.css";

/**
 * The top of a workspace page: a small maroon kicker, the page question or
 * title, one line of explanation, and an optional control on the right.
 * Shared by Start planning and Settings so pages read as one product.
 */
export function PageHeader({
  kicker,
  title,
  lede,
  aside,
}: {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <p className={styles.kicker}>{kicker}</p>
        <h1 className={styles.title}>{title}</h1>
        {lede ? <p className={styles.lede}>{lede}</p> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </header>
  );
}

/** A section label with a fading rule, e.g. "Your workspace". */
export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className={styles.sectionTitle}>
      {children}
    </h2>
  );
}
