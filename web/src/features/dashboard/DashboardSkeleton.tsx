import { Skeleton, SkeletonCard, SkeletonText } from "@/components/Skeleton";

import styles from "./DashboardSkeleton.module.css";

/** Reserve the same learning column and combined risk card as the loaded page. */
export function DashboardSkeleton() {
  return (
    <div className={styles.wrap} aria-busy="true" aria-label="Loading dashboard">
      <div className={styles.contextBar} aria-hidden="true">
        {["6rem", "9rem", "8rem", "10rem"].map((width, index) => (
          <Skeleton key={index} width={width} height="2.25rem" radius="full" />
        ))}
      </div>
      <Skeleton width="60%" height="2rem" />
      <div className={styles.grid}>
        <div className={styles.wrap}>
          <SkeletonCard label="Loading the science introduction">
            <Skeleton width="60%" height="0.75rem" />
            <Skeleton height="150px" radius="md" />
            <SkeletonText lines={2} />
          </SkeletonCard>
          <SkeletonCard label="Loading risk and prevention">
            <SkeletonText lines={2} />
            <div className={styles.columns}>
              {[0, 1].map((column) => (
                <Skeleton key={column} height="180px" radius="md" />
              ))}
            </div>
            <SkeletonText lines={3} />
          </SkeletonCard>
        </div>
        <SkeletonCard label="Loading the health risk estimate and map">
          <Skeleton width="50%" height="0.75rem" />
          <SkeletonText lines={2} />
          <Skeleton height="34px" radius="md" />
          <div className={styles.riskLayout}>
            <div className={styles.wrap}>
              <Skeleton height="230px" radius="md" />
              <Skeleton height="190px" radius="md" />
            </div>
            <div className={styles.wrap}>
              <Skeleton height="330px" radius="md" />
              <Skeleton width="85%" height="1rem" />
            </div>
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}
