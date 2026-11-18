import styles from "./ConfigurePlan.module.css";

export type OutcomeOption = { code: string; label: string; description: string };

type Props = {
  hazardLabel: string;
  domainLabel: string;
  options: OutcomeOption[];
  chosen: string[];
  onToggle: (code: string) => void;
};

/** On CHART's roadmap: shown so planners see what is coming, never selectable. */
const COMING_SOON_HAZARDS = ["Flooding", "Drought", "Air pollution"];
const COMING_SOON_DOMAINS = ["Vector-borne diseases"];

/** Step 2 (canvas frame 11): the hazard, health domain and outcomes. */
export function OutcomesStep({
  hazardLabel,
  domainLabel,
  options,
  chosen,
  onToggle,
}: Props) {
  return (
    <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardTitle}>
        Climate hazards and health outcomes
      </h2>
      <p className={styles.cardLede}>
        {hazardLabel} and {domainLabel.toLowerCase()} are the hazard and health domain
        available today. Choose which health outcomes the plan should address.
      </p>
      <fieldset className={styles.choices}>
        <legend className={styles.eyebrow}>Climate hazard</legend>
        <Choice
          type="checkbox"
          title={hazardLabel}
          sub="Available now."
          checked
          fixed
        />
        {COMING_SOON_HAZARDS.map((label) => (
          <Choice key={label} type="checkbox" title={label} sub="Coming soon" />
        ))}
      </fieldset>
      <fieldset className={styles.choices}>
        <legend className={styles.eyebrow}>Health domain</legend>
        <Choice type="radio" title={domainLabel} sub="Available now." checked fixed />
        {COMING_SOON_DOMAINS.map((label) => (
          <Choice key={label} type="radio" title={label} sub="Coming soon" />
        ))}
      </fieldset>
      <fieldset className={styles.choices} aria-describedby="outcomes-hint">
        <legend className={styles.eyebrow}>Health outcomes</legend>
        {options.map((option) => (
          <Choice
            key={option.code}
            type="checkbox"
            title={option.label}
            sub={option.description}
            checked={chosen.includes(option.code)}
            onChange={() => onToggle(option.code)}
          />
        ))}
      </fieldset>
      {chosen.length === 0 ? (
        <p id="outcomes-hint" className={styles.problem} role="alert">
          Choose at least one health outcome to continue.
        </p>
      ) : null}
    </section>
  );
}

/**
 * A checkbox or radio card. `fixed`: the one option available, chosen and
 * not changeable; neither `fixed` nor `onChange`: coming soon, disabled.
 */
function Choice({
  type,
  title,
  sub,
  checked = false,
  fixed = false,
  onChange,
}: {
  type: "checkbox" | "radio";
  title: string;
  sub: string;
  checked?: boolean;
  fixed?: boolean;
  onChange?: () => void;
}) {
  const soon = !fixed && !onChange;
  return (
    <label
      className={styles.choice}
      data-checked={checked || undefined}
      data-soon={soon || undefined}
    >
      <input
        type={type}
        checked={checked}
        disabled={fixed || soon}
        onChange={onChange}
        className={styles.choiceInput}
      />
      <span className={styles.choiceTitle}>{title}</span>
      <span className={styles.choiceSub}>{sub}</span>
    </label>
  );
}
