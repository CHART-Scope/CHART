"use client";

import { Icon } from "@/components/Icon";

import styles from "./DashboardHeader.module.css";

type Props = {
  country: string;
  areaName: string;
  hazardLabel: string;
  healthDomainLabel: string;
  onPlayVideo?: () => void;
};

/**
 * Top of the dashboard: breadcrumb + planning-context pill, then the
 * hero card with a video placeholder and the "Understand the climate-
 * health risk" explainer.
 *
 * The hazard + health-domain pill mirrors what the user picked (or was
 * defaulted to) on the /plan Mad Libs card. Today those are locked to
 * the deployed LBW model, so we render "Extreme heat + MNCH" verbatim.
 */
export function DashboardHeader({
  country,
  areaName,
  hazardLabel,
  healthDomainLabel,
  onPlayVideo,
}: Props) {
  const pill = `${hazardLabel} + ${healthDomainLabel}`;
  return (
    <header className={styles.wrap}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <span>{country}</span>
        <span className={styles.separator} aria-hidden>
          ›
        </span>
        <strong>{areaName}</strong>
        <span className={styles.pill} title="Planning context">
          {pill}
        </span>
      </nav>

      <article className={styles.card}>
        <button
          type="button"
          className={styles.videoButton}
          aria-label="Play the climate-health risk overview video"
          onClick={onPlayVideo}
          disabled={!onPlayVideo}
        >
          <span className={styles.videoCircle}>
            <Icon name="play" size={16} />
          </span>
        </button>
        <div className={styles.cardBody}>
          <p className={styles.eyebrow}>Understand the climate-health risk</p>
          <h1 className={styles.title}>
            Protecting mothers and babies from extreme heat: The science and actions
            that can save lives
          </h1>
        </div>
      </article>
    </header>
  );
}
