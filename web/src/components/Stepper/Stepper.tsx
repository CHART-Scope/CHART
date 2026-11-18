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
  /** `rail`: the vertical list on charcoal (onboarding). `tabs`: a row of
   * numbered tabs on a light page (Configure plan). */
  variant?: "rail" | "tabs";
  /** Steps after this index are shown but cannot be opened yet. */
  lastOpenIndex?: number;
  "aria-label"?: string;
};

export function Stepper({
  steps,
  currentIndex,
  onStepClick,
  variant = "rail",
  lastOpenIndex = steps.length - 1,
  "aria-label": label,
}: Props) {
  return (
    <nav
      className={[styles.nav, variant === "tabs" ? styles.tabs : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      {steps.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        const state = isActive ? "active" : isDone ? "done" : "";
        return (
          <button
            key={step.id}
            type="button"
            className={[styles.item, state ? styles[state] : ""]
              .filter(Boolean)
              .join(" ")}
            aria-current={isActive ? "step" : undefined}
            disabled={i > lastOpenIndex}
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
