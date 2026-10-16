import { ExplainerVideo } from "@/components/ExplainerVideo";
import styles from "./ScienceVideo.module.css";

export function ScienceVideo() {
  return (
    <section className={styles.card} aria-label="Understanding the science">
      <h2>Understanding the science</h2>
      <ExplainerVideo />
      <p>Understanding climate and health: the science and ways to reduce risk.</p>
    </section>
  );
}
