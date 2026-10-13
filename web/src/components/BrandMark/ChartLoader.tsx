import { BrandMark } from "./BrandMark";
import styles from "./ChartLoader.module.css";

/**
 * Full-page wait in CHART's own voice: the animated mark, one status line and
 * an optional detail. Used while signing in, restoring a session, or while
 * CHART is briefly unreachable.
 */
type Props = {
  status: string;
  detail?: string;
  tone?: "busy" | "warning";
};

export function ChartLoader({ status, detail, tone = "busy" }: Props) {
  return (
    <main className={styles.page}>
      <div className={styles.stage} role="status" aria-live="polite">
        <BrandMark size={72} animated={tone === "busy"} />
        <p className={styles.word}>CHART</p>
        <p
          className={[styles.status, tone === "warning" ? styles.warning : ""].join(
            " ",
          )}
        >
          {status}
        </p>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
      </div>
    </main>
  );
}
