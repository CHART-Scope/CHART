import { Skeleton } from "@/components/Skeleton";

import styles from "./SettingsCard.module.css";

/**
 * The settings page's shape, before its session is restored: a tab bar and
 * the two cards of the default Workspace tab. Its layout is known ahead of
 * time, so the placeholder can be the layout.
 */
export function SettingsSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true">
      <div className={styles.skeletonTabs} aria-hidden="true">
        {[5, 3, 3.5, 3, 2.5].map((width, index) => (
          <Skeleton key={index} width={`${width}rem`} height="1rem" />
        ))}
      </div>
      {[1, 2].map((rows, index) => (
        <section key={index} className={styles.card} aria-hidden="true">
          <div className={styles.header}>
            <div className={styles.heading}>
              <Skeleton width="5rem" height="0.65rem" />
              <Skeleton width="14rem" height="1.15rem" />
            </div>
            <Skeleton width="6.5rem" height="2rem" radius="md" />
          </div>
          <div className={styles.loading}>
            {Array.from({ length: rows }, (_, row) => (
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
