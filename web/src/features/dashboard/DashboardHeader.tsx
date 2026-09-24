"use client";

import type { ReactNode } from "react";

import styles from "./DashboardHeader.module.css";

type Props = {
  /**
   * The place trail, broadest first: `["Kenya", "Garissa"]` or
   * `["India", "Madhya Pradesh", "Bhopal Division"]`.
   *
   * A trail rather than a country plus an area name, because those two were
   * derived independently and could say the same thing twice: on a
   * country-level dashboard both resolved to "Kenya", rendering
   * "Kenya › Kenya". Consecutive repeats are dropped here so that cannot
   * happen however the caller composes it.
   */
  trail: string[];
  hazardLabel: string;
  healthDomainLabel: string;
  /** Optional inline element rendered in place of the country name — the
   * dashboard passes an `<InlineContextSwitcher />` here so users can
   * flip between installed families straight from the breadcrumb without
   * a separate settings-style card taking up vertical space. */
  countrySlot?: ReactNode;
};

/**
 * Top of the dashboard: breadcrumb + planning-context pill.
 *
 * The hazard + health-domain pill mirrors the model actually selected, so
 * switching outcome changes it: low birth weight and under-five mortality
 * belong to different health domains and must not share one caption.
 */
export function DashboardHeader({
  trail,
  hazardLabel,
  healthDomainLabel,
  countrySlot,
}: Props) {
  const pill = `${hazardLabel} + ${healthDomainLabel}`;
  const steps = trail.filter((step, index) => step && step !== trail[index - 1]);
  return (
    <header className={styles.wrap}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <span key={`${step}-${index}`} className={styles.step}>
              {index > 0 ? (
                <span className={styles.separator} aria-hidden>
                  ›
                </span>
              ) : null}
              {index === 0 && countrySlot ? (
                countrySlot
              ) : last ? (
                <strong>{step}</strong>
              ) : (
                <span>{step}</span>
              )}
            </span>
          );
        })}
        <span className={styles.pill} title="Planning context">
          {pill}
        </span>
      </nav>
    </header>
  );
}
