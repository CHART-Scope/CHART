import styles from "./Stepper.module.css";

export type Step = {
  id: string;
  title: string;
  sub?: string;
};

type Props = {
  steps: Step[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
};

export function Stepper({ steps, currentIndex, onStepClick }: Props) {
  return (
    <nav className={styles.nav}>
      {steps.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        const state = isActive ? "active" : isDone ? "done" : "";
        return (
          <button
            key={step.id}
            type="button"
            className={styles.item}
            onClick={() => onStepClick?.(i)}
          >
            <div
              className={[styles.dot, state ? styles[state] : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {isDone ? "✓" : i + 1}
            </div>
            <div>
              <div
                className={[styles.title, state ? styles[state] : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {step.title}
              </div>
              {step.sub && <div className={styles.sub}>{step.sub}</div>}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
