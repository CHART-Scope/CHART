"use client";

import { useEffect, useRef, useState } from "react";

import { InlineSelect } from "@/components/InlineSelect";

import { costDots, type Action } from "./actionCatalog";
import styles from "./ActionPanel.module.css";
import { timingSeason } from "./planLabels";
import { RichText } from "./RichText";
import {
  actionStatuses,
  statusLabels,
  type ActionProgress,
  type ActionStatus,
} from "./useActionProgress";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "steps", label: "Steps" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "evidence", label: "Evidence" },
] as const;
type SectionId = (typeof sections)[number]["id"];

type Props = {
  action: Action | null;
  /** e.g. "Extreme heat · Maternal and child health · Madhya Pradesh". */
  contextLabel: string;
  progress: ActionProgress;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

/**
 * Right-hand detail panel for one recommended action. One scrolling body with
 * four sections; the tabs jump to a section and follow the reader's scroll.
 */
export function ActionPanel({
  action,
  contextLabel,
  progress,
  onClose,
  onPrevious,
  onNext,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const open = action !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // A new action starts at its overview.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setActiveSection("overview");
  }, [action?.id]);

  function jumpTo(id: SectionId) {
    const body = bodyRef.current;
    const section = body?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!body || !section) return;
    setActiveSection(id);
    body.scrollTo({ top: section.offsetTop, behavior: "smooth" });
  }

  function followScroll() {
    const body = bodyRef.current;
    if (!body) return;
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
    let current: SectionId = "overview";
    for (const { id } of sections) {
      const section = body.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (section && section.offsetTop - body.scrollTop < 80) current = id;
    }
    setActiveSection(atBottom ? "evidence" : current);
  }

  const status = action ? progress.statusOf(action.id) : "not-started";

  return (
    <div className={styles.root} data-open={open || undefined} aria-hidden={!open}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close action details"
      />
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-panel-title"
      >
        {action ? (
          <>
            <header className={styles.header}>
              <div className={styles.topline}>
                {onPrevious ? (
                  <button
                    type="button"
                    className={styles.stepButton}
                    onClick={onPrevious}
                    aria-label="Previous action"
                  >
                    ‹
                  </button>
                ) : null}
                {onNext ? (
                  <button
                    type="button"
                    className={styles.stepButton}
                    onClick={onNext}
                    aria-label="Next action"
                  >
                    ›
                  </button>
                ) : null}
                <p className={styles.crumb}>{contextLabel}</p>
                <button
                  ref={closeRef}
                  type="button"
                  className={styles.close}
                  onClick={onClose}
                  aria-label="Close action details"
                >
                  ×
                </button>
              </div>
              <div className={styles.titleRow}>
                <h2 id="action-panel-title" className={styles.title}>
                  {action.title}
                </h2>
                <InlineSelect
                  aria-label="Action status"
                  size="sm"
                  className={`${styles.status} ${styles[status]}`}
                  value={status}
                  onChange={(value) =>
                    progress.setStatus(action.id, value as ActionStatus)
                  }
                  options={actionStatuses.map((value) => ({
                    value,
                    label: statusLabels[value],
                  }))}
                />
              </div>
              <nav className={styles.sectionNav} aria-label="Action sections">
                {sections.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={styles.sectionTab}
                    aria-current={activeSection === id ? "true" : undefined}
                    onClick={() => jumpTo(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </header>

            <div ref={bodyRef} className={styles.body} onScroll={followScroll}>
              <section data-section="overview" aria-label="Overview">
                {action.summary ? <p>{action.summary}</p> : null}
                <dl className={styles.metaGrid}>
                  <Meta label="Responsible department" values={action.departments} />
                  <Meta label="Climate hazard" values={action.hazards} />
                  <Meta label="Action type" values={action.action_types} />
                  <Meta label="Level" values={action.levels} />
                  <Meta label="Who it protects" values={action.target_populations} />
                  <Meta label="Health outcomes" values={action.health_outcomes} />
                </dl>
                <h3 className={styles.label}>Implementation cost</h3>
                <p className={styles.cost}>
                  <strong>{action.cost_level ?? "Not yet assessed"}</strong>
                  {action.cost_level && costDots[action.cost_level] !== undefined ? (
                    <span className={styles.costDots} aria-hidden>
                      {[1, 2, 3].map((dot) => (
                        <span
                          key={dot}
                          data-filled={
                            dot <= (costDots[action.cost_level!] ?? 0) || undefined
                          }
                        />
                      ))}
                    </span>
                  ) : null}
                </p>
                {action.cost_reasoning ? (
                  <p className={styles.supporting}>{action.cost_reasoning}</p>
                ) : null}
                <h3 className={styles.label}>Implementation timeframe</h3>
                <div className={styles.pillRow}>
                  {action.seasons.map((season) => (
                    <span key={season} className={styles.pill}>
                      {timingSeason[season]}
                    </span>
                  ))}
                </div>
                {action.decision_trigger ? (
                  <>
                    <h3 className={styles.label}>When to act</h3>
                    <RichText
                      text={action.decision_trigger}
                      listClassName={styles.list}
                    />
                  </>
                ) : null}
              </section>

              <section data-section="steps" aria-label="Steps">
                <h3 className={styles.label}>Description &amp; key steps</h3>
                <RichText text={action.description} listClassName={styles.list} />
              </section>

              <section data-section="stakeholders" aria-label="Stakeholders">
                <h3 className={styles.label}>Responsible stakeholders</h3>
                <ul className={styles.list}>
                  {action.stakeholders.map((person) => (
                    <li key={person}>{person}</li>
                  ))}
                </ul>
                {action.rationale ? (
                  <>
                    <h3 className={styles.label}>Rationale</h3>
                    <RichText text={action.rationale} listClassName={styles.list} />
                  </>
                ) : null}
                {action.expected_outcomes ? (
                  <>
                    <h3 className={styles.label}>Expected outcomes</h3>
                    <ul className={styles.list}>
                      {action.expected_outcomes
                        .split("\n")
                        .filter((line) => line.trim())
                        .map((line) => (
                          <li key={line}>{line.trim()}</li>
                        ))}
                    </ul>
                  </>
                ) : null}
              </section>

              <section data-section="evidence" aria-label="Evidence">
                <h3 className={styles.label}>Source references</h3>
                <References items={action.references} />
                {action.case_studies.length > 0 ? (
                  <>
                    <h3 className={styles.label}>Case studies</h3>
                    <References items={action.case_studies} />
                  </>
                ) : null}
              </section>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function Meta({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.pillRow}>
        {values.map((value) => (
          <span key={value} className={styles.pill}>
            {value}
          </span>
        ))}
      </dd>
    </div>
  );
}

function References({ items }: { items: Action["references"] }) {
  return (
    <ul className={styles.references}>
      {items.map((item) =>
        item.url ? (
          <li key={item.citation}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <span>{item.citation}</span>
              <span aria-hidden>↗</span>
            </a>
          </li>
        ) : (
          <li key={item.citation}>{item.citation}</li>
        ),
      )}
    </ul>
  );
}
