"use client";

import { useEffect, useRef, useState } from "react";

import { InlineSelect } from "@/components/InlineSelect";
import { RISK_BANDS } from "@/features/dashboard/SpatialRiskMap";

import { costLevels, districtFill, type Action } from "./actionCatalog";
import { AssignDistrictsForm } from "./AssignDistrictsForm";
import styles from "./ActionPanel.module.css";
import {
  actionStatuses,
  statusLabels,
  type ActionProgress,
  type ActionStatus,
} from "./useActionProgress";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "priority", label: "Priority districts" },
  { id: "steps", label: "Steps" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "evidence", label: "Evidence" },
] as const;
type SectionId = (typeof sections)[number]["id"];

type Props = {
  action: Action | null;
  /** e.g. "Extreme heat · Maternal and child health · Madhya Pradesh". */
  contextLabel: string;
  hazardLabel: string;
  outcomeLabel: string;
  progress: ActionProgress;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

/**
 * Right-hand detail panel for one recommended action. One scrolling body with
 * five sections; the tabs jump to a section and follow the reader's scroll.
 */
export function ActionPanel({
  action,
  contextLabel,
  hazardLabel,
  outcomeLabel,
  progress,
  onClose,
  onPrevious,
  onNext,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [openDistrict, setOpenDistrict] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
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

  // A new action starts at its overview with nothing half-edited.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setActiveSection("overview");
    setOpenDistrict(null);
    setAssigning(false);
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
  const assignment = action ? progress.assignmentOf(action.id) : null;

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

            <div
              ref={bodyRef}
              className={styles.body}
              onScroll={followScroll}
              onClick={() => setOpenDistrict(null)}
            >
              <section data-section="overview" aria-label="Overview">
                <dl className={styles.metaGrid}>
                  <Meta label="Responsible department" values={[action.department]} />
                  <Meta label="Climate hazard" values={[hazardLabel]} />
                  <Meta label="Action type" values={[action.actionType]} />
                  <Meta
                    label="Application level"
                    values={[action.applicationLevel.join(" · ")]}
                  />
                </dl>
                <h3 className={styles.label}>Implementation cost</h3>
                <p className={styles.cost}>
                  <strong>{action.cost}</strong>
                  <span className={styles.costDots} aria-hidden>
                    {costLevels.map((level, index) => (
                      <span
                        key={level}
                        data-filled={
                          index <= costLevels.indexOf(action.cost) || undefined
                        }
                      />
                    ))}
                  </span>
                </p>
                <p className={styles.supporting}>{action.costNotes}</p>
                <h3 className={styles.label}>Implementation timeframe</h3>
                <div className={styles.pillRow}>
                  {action.seasons.map((season) => (
                    <span key={season} className={styles.pill}>
                      {season}
                    </span>
                  ))}
                </div>
                <p className={styles.supporting}>{action.timeframeNotes}</p>
              </section>

              <section
                data-section="priority"
                aria-label="Priority districts"
                className={styles.priority}
              >
                <div className={styles.priorityHead}>
                  <h3 className={styles.priorityTitle}>
                    Priority districts for this action
                  </h3>
                  {!assigning ? (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => setAssigning(true)}
                    >
                      {assignment ? "Edit assignment" : "Assign to districts →"}
                    </button>
                  ) : null}
                </div>
                <ul className={styles.chipRow}>
                  {action.priorityDistricts.map((item) => (
                    <li key={item.district} className={styles.chipItem}>
                      <button
                        type="button"
                        className={styles.chip}
                        aria-expanded={openDistrict === item.district}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenDistrict((current) =>
                            current === item.district ? null : item.district,
                          );
                        }}
                      >
                        <span
                          className={styles.dot}
                          style={{ background: districtFill(item.percent) }}
                        />
                        {item.district}
                        {assignment?.districts.includes(item.district) ? (
                          <span className={styles.assigned} aria-label="assigned">
                            ✓
                          </span>
                        ) : null}
                      </button>
                      {openDistrict === item.district ? (
                        <p className={styles.tooltip} role="status">
                          <strong>{item.percent}%</strong> of {outcomeLabel} cases in{" "}
                          {item.district} may be attributable to heat exposure at an
                          average maximum temperature of {item.temperatureC}°C.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className={styles.legend}>
                  {RISK_BANDS.map((band) => (
                    <span key={band.label}>
                      <span className={styles.dot} style={{ background: band.fill }} />
                      {band.label}
                    </span>
                  ))}
                </p>
                {assignment && !assigning ? (
                  <p className={styles.assignSummary} role="status">
                    Assigned to {assignment.districts.length}{" "}
                    {assignment.districts.length === 1 ? "district" : "districts"} ·{" "}
                    {assignment.assignee} · Due {formatDue(assignment.dueDate)}
                  </p>
                ) : null}
                {assigning ? (
                  <AssignDistrictsForm
                    districts={action.priorityDistricts}
                    initial={assignment}
                    onCancel={() => setAssigning(false)}
                    onSave={(next) => {
                      progress.setAssignment(action.id, next);
                      setAssigning(false);
                    }}
                  />
                ) : null}
              </section>

              <section data-section="steps" aria-label="Steps">
                <h3 className={styles.label}>Description &amp; key steps</h3>
                {action.description.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {action.stepsHeading ? (
                  <p className={styles.stepsHeading}>{action.stepsHeading}</p>
                ) : null}
                <ul className={styles.list}>
                  {action.steps.map((step) => (
                    <li key={step.text}>
                      {step.lead ? <strong>{step.lead}</strong> : null}
                      {step.lead ? ` — ${step.text}` : step.text}
                    </li>
                  ))}
                </ul>
              </section>

              <section data-section="stakeholders" aria-label="Stakeholders">
                <h3 className={styles.label}>Responsible stakeholders</h3>
                <ul className={styles.list}>
                  {action.stakeholders.map((person) => (
                    <li key={person.role}>
                      {person.role}
                      {person.example ? (
                        <span className={styles.example}>{person.example}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <h3 className={styles.label}>Rationale</h3>
                {action.rationale.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <h3 className={styles.label}>Expected outcomes</h3>
                <ul className={styles.list}>
                  {action.outcomes.map((outcome) => (
                    <li key={outcome}>{outcome}</li>
                  ))}
                </ul>
              </section>

              <section data-section="evidence" aria-label="Evidence">
                <h3 className={styles.label}>Source references</h3>
                <References items={action.sources} />
                {action.caseStudies.length > 0 ? (
                  <>
                    <h3 className={styles.label}>Case studies</h3>
                    <References items={action.caseStudies} />
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

function References({ items }: { items: Action["sources"] }) {
  return (
    <ul className={styles.references}>
      {items.map((item) => (
        <li key={item.citation}>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <span>{item.citation}</span>
            <span aria-hidden>↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function formatDue(date: string) {
  if (!date) return "no due date set";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
