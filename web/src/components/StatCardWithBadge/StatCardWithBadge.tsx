import type { ReactNode } from "react";

import { PrecisionBadge, type PrecisionLevel } from "@/components/PrecisionBadge";

import styles from "./StatCardWithBadge.module.css";

type Props = {
  eyebrow: string;
  headline: string;
  supporting: ReactNode;
  range?: ReactNode;
  precision: PrecisionLevel;
  precisionLabel?: string;
  loading?: boolean;
  onPrecisionInfo?: () => void;
};

export function StatCardWithBadge({
  eyebrow,
  headline,
  supporting,
  range,
  precision,
  precisionLabel,
  loading = false,
  onPrecisionInfo,
}: Props) {
  return (
    <article className={styles.card} data-loading={loading}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      {loading ? (
        <div className={styles.skeletonBlock} aria-live="polite" />
      ) : (
        <p className={styles.headline}>{headline}</p>
      )}
      <p className={styles.supporting}>{loading ? " " : supporting}</p>
      {range && !loading ? <p className={styles.range}>{range}</p> : null}
      {/* Precision badge hidden for now.
      {loading ? null : (
        <PrecisionBadge
          level={precision}
          label={precisionLabel}
          onClick={onPrecisionInfo}
          aria-label={`Precision ${precisionLabel ?? precision}`}
        />
      )}
      */}
    </article>
  );
}
