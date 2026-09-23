import styles from "./ScienceVideoPlaceholder.module.css";

export function ScienceVideoPlaceholder() {
  return (
    <section className={styles.card} aria-label="Understanding the science">
      <h2>Understanding the science</h2>
      <div className={styles.placeholder}>
        <span aria-hidden="true">▷</span>
        <span>Video coming soon</span>
      </div>
      <p>Understanding climate and health: the science and ways to reduce risk.</p>
    </section>
  );
}
