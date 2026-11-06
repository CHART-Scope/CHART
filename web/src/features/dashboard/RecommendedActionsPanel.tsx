"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import {
  ActionPanel,
  statusLabels,
  useActionProgress,
  useHeatActions,
} from "@/features/actions";

import styles from "./RecommendedActionsPanel.module.css";

type Tone = { toneClass: string; icon: IconName };

// Action types (the feed's vocabulary) by their first word.
const TYPE_TONES: Record<string, Tone> = {
  Behaviour: { toneClass: styles.tBehaviour, icon: "users" },
  Capacity: { toneClass: styles.tBehaviour, icon: "users" },
  Clinical: { toneClass: styles.tBehaviour, icon: "heart-handshake" },
  Supplies: { toneClass: styles.tBehaviour, icon: "droplet" },
  Environment: { toneClass: styles.tEnvironment, icon: "leaf" },
  Infrastructure: { toneClass: styles.tEnvironment, icon: "building" },
  Policy: { toneClass: styles.tPolicy, icon: "policy" },
  Financing: { toneClass: styles.tPolicy, icon: "policy" },
  Early: { toneClass: styles.tPolicy, icon: "alert-triangle" },
};
const NEUTRAL: Tone = { toneClass: styles.tNeutral, icon: "dots" };

type Props = {
  /** Page geography; the "See all" page is scoped to it. */
  geographyId: string;
  /** Area actually shown (a division, or the page geography). Status and
   * assignments are recorded against it. */
  placeId: string;
  placeName: string;
  outcome: string;
  hazardLabel: string;
  healthDomainLabel: string;
};

/**
 * The dashboard's short list of recommended actions. Opens the same detail
 * panel as the full actions page, and "See all" goes there.
 */
export function RecommendedActionsPanel({
  geographyId,
  placeId,
  placeName,
  outcome,
  hazardLabel,
  healthDomainLabel,
}: Props) {
  const { actions, loading, error, retry } = useHeatActions(geographyId);
  const progress = useActionProgress(placeId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closePanel = useCallback(() => setSelectedId(null), []);

  const query = new URLSearchParams({ outcome });
  if (placeId !== geographyId) query.set("admin_unit", placeId);
  const seeAllHref = `/dashboard/${encodeURIComponent(geographyId)}/actions?${query}`;

  return (
    <>
      <section className={styles.panel} aria-labelledby="recommended-actions-heading">
        <header className={styles.header}>
          <p className={styles.eyebrow} id="recommended-actions-heading">
            Recommended actions
          </p>
          <span className={styles.filterChip} title={`Filtered by ${hazardLabel}`}>
            <Icon name="sun" size={12} />
            For {hazardLabel.toLowerCase()}
          </span>
        </header>
        {loading ? (
          <p className={styles.status} role="status">
            Loading actions…
          </p>
        ) : null}
        {error ? (
          <p className={styles.status} role="alert">
            {error}{" "}
            <button type="button" className={styles.seeAll} onClick={retry}>
              Try again
            </button>
          </p>
        ) : null}
        <ul className={styles.list}>
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className={styles.item}
                onClick={() => setSelectedId(action.id)}
                aria-label={`Open ${action.title}`}
              >
                <div className={styles.itemBody}>
                  <p className={styles.title}>{action.title}</p>
                  <div className={styles.pillRow}>
                    {action.action_types[0] ? (
                      <CategoryPill label={action.action_types[0]} />
                    ) : null}
                    {action.departments[0] ? (
                      <span className={`${styles.pill} ${styles.tNeutral}`}>
                        {action.departments[0]}
                      </span>
                    ) : null}
                    <span className={styles.status}>
                      {statusLabels[progress.statusOf(action.id)]}
                    </span>
                  </div>
                </div>
                <Icon name="arrow-right" size={16} className={styles.itemChevron} />
              </button>
            </li>
          ))}
        </ul>
        <Link href={seeAllHref} className={styles.seeAll}>
          See all recommended actions
        </Link>
      </section>
      <ActionPanel
        action={actions.find((action) => action.id === selectedId) ?? null}
        contextLabel={`${hazardLabel} · ${healthDomainLabel} · ${placeName}`}
        progress={progress}
        onClose={closePanel}
      />
    </>
  );
}

function CategoryPill({ label }: { label: string }) {
  const tone = TYPE_TONES[label.split(/[\s:]/)[0]] ?? NEUTRAL;
  return (
    <span className={`${styles.pill} ${tone.toneClass}`}>
      <Icon name={tone.icon} size={12} />
      {label}
    </span>
  );
}
