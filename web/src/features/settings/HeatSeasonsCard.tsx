"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { planningCycle } from "@/features/actions/actionCycle";
import { SettingsCard } from "@/features/planning/SettingsCard";
import {
  listHeatSeasons,
  resetHeatSeason,
  saveHeatSeason,
  type HeatSeasonCalendar,
  type SeasonPhase,
} from "@/lib/heatSeasonsClient";

import styles from "./HeatSeasonsCard.module.css";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const PHASES: { key: SeasonPhase; label: string; tag: string }[] = [
  { key: "b", label: "Before", tag: "Preparation" },
  { key: "d", label: "During", tag: "Response" },
  { key: "a", label: "After", tag: "Review" },
  { key: "o", label: "Off", tag: "" },
];
const label = (key: SeasonPhase) => PHASES.find((phase) => phase.key === key)!.label;

/**
 * Settings > Heat seasons (frame 17b): the before, during and after months of
 * each place. Pick a phase, then click months to paint them; Save stores the
 * place's own calendar and "Use <parent>" drops it so the place inherits
 * again. The calendars lay out the recommended-actions Gantt chart.
 */
export function HeatSeasonsCard({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<HeatSeasonCalendar[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [brush, setBrush] = useState<SeasonPhase>("d");
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listHeatSeasons(controller.signal)
      .then((loaded) => {
        setItems(loaded);
        setSelectedId((current) => current ?? loaded[0]?.geography_id ?? null);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, []);

  const selected = items?.find((item) => item.geography_id === selectedId) ?? null;
  const parent =
    items?.find((item) => item.geography_id === selected?.parent_id) ?? null;
  const months = draft ?? selected?.months ?? "oooooooooooo";

  const select = (id: string) => {
    setSelectedId(id);
    setDraft(null);
    setStatus(null);
  };
  const paint = (index: number) => {
    if (!canEdit) return;
    setDraft(months.slice(0, index) + brush + months.slice(index + 1));
    setStatus(null);
  };
  // A saved or reset calendar changes what its descendants inherit, so the
  // whole list is read again.
  const apply = async (change: () => Promise<HeatSeasonCalendar>, done: string) => {
    setBusy(true);
    try {
      await change();
      setItems(await listHeatSeasons());
      setDraft(null);
      setStatus({ text: done, error: false });
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      eyebrow="Heat seasons"
      title="Heat season calendar"
      headingId="heat-seasons-heading"
      description="Before, during and after months for each area. Feeds the Gantt chart and plan timeline. Areas without their own calendar inherit their parent's."
      loading={items === null && !loadError}
      error={loadError}
      action={
        canEdit && selected ? (
          <Button
            disabled={busy || draft === null}
            onClick={() =>
              apply(
                () => saveHeatSeason(selected.geography_id, months, selected.source),
                `Saved the ${selected.name} calendar.`,
              )
            }
          >
            Save
          </Button>
        ) : null
      }
    >
      {items && items.length === 0 ? (
        <p className={styles.note}>No places are in your planning area yet.</p>
      ) : null}
      {items && selected ? (
        <div className={styles.layout}>
          <ul className={styles.places} aria-label="Places">
            {items.map((item) => (
              <li key={item.geography_id}>
                <button
                  type="button"
                  className={styles.place}
                  aria-current={item.geography_id === selectedId || undefined}
                  style={{ paddingLeft: `${14 + item.depth * 18}px` }}
                  onClick={() => select(item.geography_id)}
                >
                  <span className={styles.placeText}>
                    <span
                      className={styles.placeName}
                      data-root={item.depth === 0 || undefined}
                    >
                      {item.name}
                      <span className={styles.level}>{item.level_label}</span>
                    </span>
                    <span className={styles.placeNote}>{stateText(item)}</span>
                  </span>
                  <span className={styles.mini} aria-hidden="true">
                    {[...(item.months ?? "oooooooooooo")].map((key, index) => (
                      <span key={index} data-phase={key} />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.editor}>
            <div className={styles.title}>
              <h3>{selected.name}</h3>
              <span className={styles.level}>{selected.level_label}</span>
              <span className={styles.state} data-edited={draft !== null || undefined}>
                {draft !== null ? "Edited" : stateText(selected)}
              </span>
            </div>
            <p className={styles.source}>
              {selected.source ? `Source: ${selected.source}` : "No source recorded"}
            </p>

            {canEdit ? (
              <div
                className={styles.brushes}
                role="radiogroup"
                aria-label="Set months as"
              >
                {PHASES.map((phase) => (
                  <button
                    key={phase.key}
                    type="button"
                    role="radio"
                    aria-checked={brush === phase.key}
                    onClick={() => setBrush(phase.key)}
                  >
                    <span data-phase={phase.key} />
                    {phase.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.calendar} role="group" aria-label="Months">
              {MONTHS.map((month, index) => {
                const key = months[index] as SeasonPhase;
                return (
                  <button
                    key={month}
                    type="button"
                    data-phase={key}
                    aria-label={`${month}: ${label(key)}`}
                    disabled={!canEdit}
                    onClick={() => paint(index)}
                  >
                    {month}
                  </button>
                );
              })}
            </div>

            <div className={styles.foot}>
              <span className={styles.counts}>
                {PHASES.map((phase) => (
                  <span key={phase.key}>
                    <span data-phase={phase.key} />
                    {phase.label}{" "}
                    {[...months].filter((key) => key === phase.key).length}
                  </span>
                ))}
              </span>
              {canEdit ? (
                <span className={styles.links}>
                  {selected.own ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        apply(
                          () => resetHeatSeason(selected.geography_id),
                          `${selected.name} now inherits its calendar.`,
                        )
                      }
                    >
                      {parent ? `Use ${parent.name}` : "Use the official season"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={draft === null}
                    onClick={() => {
                      setDraft(null);
                      setStatus(null);
                    }}
                  >
                    Reset
                  </button>
                </span>
              ) : null}
            </div>
            {status ? (
              <p
                className={status.error ? styles.error : styles.note}
                role={status.error ? "alert" : "status"}
              >
                {status.text}
              </p>
            ) : null}

            <GanttPreview months={months} />
          </div>
        </div>
      ) : null}
    </SettingsCard>
  );
}

/** The phase strip the Gantt chart will draw, from this month on. */
function GanttPreview({ months }: { months: string }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const cells = Array.from(
    { length: 12 },
    (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1),
  );
  const valid = planningCycle(months).phases.during[1] > 0;
  return (
    <div className={styles.preview}>
      <p className={styles.previewTitle}>
        Gantt preview · from {MONTHS[start.getMonth()]} {start.getFullYear()}
      </p>
      <ol className={styles.previewStrip} aria-label="Gantt preview">
        {cells.map((date, i) => {
          const key = months[date.getMonth()] as SeasonPhase;
          const previous = i ? (months[cells[i - 1].getMonth()] as SeasonPhase) : null;
          const tag = PHASES.find((phase) => phase.key === key)!.tag;
          return (
            <li key={i}>
              <span className={styles.previewMonth}>{MONTHS[date.getMonth()]}</span>
              <span className={styles.previewBar} data-phase={valid ? key : "o"}>
                {valid && tag && key !== previous ? <span>{tag}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function stateText(item: HeatSeasonCalendar): string {
  if (item.state === "custom") return "Custom";
  if (item.state === "inherited") return `Inherits ${item.inherited_from}`;
  if (item.state === "official")
    return item.depth === 0 ? "Official season" : "Inherits the official season";
  return "No calendar set";
}
