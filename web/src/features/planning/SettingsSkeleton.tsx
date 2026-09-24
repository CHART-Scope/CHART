import { Skeleton } from "@/components/Skeleton";

import styles from "./SettingsCard.module.css";

/**
 * The settings page's shape, before its session is restored.
 *
 * Settings passed no fallback, so it showed the full-page "Opening sign in"
 * card on every visit — announcing a sign-in that was not happening, for a
 * wait that is usually a fraction of a second. Its layout is known ahead of
 * time, so the placeholder can be the layout.
 */
export function SettingsSkeleton() {
  return (
    <div className={styles.skeletonGrid} aria-busy="true">
      {[
        { rows: 1 },
        { rows: 1 },
        { rows: 2 },
        { rows: 1 },
        { rows: 1 },
        { rows: 1 },
      ].map((card, index) => (
        <section
          key={index}
          className={styles.card}
          data-wide={index === 2 || index === 5 || undefined}
          aria-hidden="true"
        >
          <div className={styles.header}>
            <div className={styles.heading}>
              <Skeleton width="5rem" height="0.65rem" />
              <Skeleton width="14rem" height="1.15rem" />
            </div>
            <Skeleton width="6.5rem" height="2rem" radius="md" />
          </div>
          <div className={styles.loading}>
            {Array.from({ length: card.rows }, (_, row) => (
              <div key={row} className={styles.loadingRow}>
                <Skeleton width="9rem" height="1rem" />
                <Skeleton width="13rem" height="0.75rem" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
