"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@/components/Skeleton";

import styles from "./SettingsCard.module.css";

/**
 * One block of the settings page.
 *
 * Settings had grown four card idioms: one with an eyebrow and a skeleton,
 * one with a bare title and the word "Loading…", one with its own header, and
 * one built from the `Panel` primitive. Four ways of saying the same thing
 * made the page read as four pages, and every new block had to pick a side.
 *
 * This is the one shape: eyebrow, title, an optional line of explanation, an
 * optional action on the right, and the block's own content below. Loading is
 * part of the shell rather than each card's invention, so nothing on the page
 * announces a wait in prose.
 */

type Props = {
  /** Small uppercase label above the title. */
  eyebrow: string;
  title: string;
  /** One line on what this block is for. Optional — omit rather than pad. */
  description?: ReactNode;
  /** Right-aligned control in the header, e.g. a link to a sub-page. */
  action?: ReactNode;
  /** Replaces the body with placeholders shaped like the rows that follow. */
  loading?: boolean;
  /** Rows to draw while loading; ignored otherwise. */
  loadingRows?: number;
  /** Announced when something has gone wrong, above the body. */
  error?: string | null;
  children?: ReactNode;
  headingId?: string;
};

export function SettingsCard({
  eyebrow,
  title,
  description,
  action,
  loading = false,
  loadingRows = 2,
  error = null,
  children,
  headingId,
}: Props) {
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
        </div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </header>

      {description ? <p className={styles.description}>{description}</p> : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div
          className={styles.loading}
          role="status"
          aria-label={`Loading ${title.toLowerCase()}`}
        >
          {Array.from({ length: loadingRows }, (_, index) => (
            <div key={index} className={styles.loadingRow}>
              <Skeleton width="9rem" height="1rem" />
              <Skeleton width="13rem" height="0.75rem" />
            </div>
          ))}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
