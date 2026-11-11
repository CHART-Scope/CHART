"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Icon } from "@/components/Icon";
import {
  ActionPanel,
  seasons,
  statusLabels,
  timingSeason,
  useActionProgress,
  useHeatActions,
} from "@/features/actions";

import styles from "./RecommendedActionsPanel.module.css";

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
 * The dashboard's recommended actions in three columns: before, during and
 * after the heat season (an action recommended for several seasons appears
 * in each). Opens the same detail panel as the full actions page, and
 * "See all" goes there.
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
        <div className={styles.seasons}>
          {seasons.map((season) => {
            const inSeason = actions.filter((action) =>
              action.seasons.includes(season),
            );
            return (
              <section
                key={season}
                className={styles.season}
                aria-label={timingSeason[season]}
              >
                <h3 className={styles.seasonTitle}>{timingSeason[season]}</h3>
                {inSeason.length === 0 && !loading && !error ? (
                  <p className={styles.none}>No actions for this season yet.</p>
                ) : null}
                <ul className={styles.list}>
                  {inSeason.map((action) => (
                    <li key={action.id}>
                      <button
                        type="button"
                        className={styles.item}
                        onClick={() => setSelectedId(action.id)}
                        aria-label={`Open ${action.title}`}
                      >
                        <p className={styles.title}>{action.title}</p>
                        <div className={styles.pillRow}>
                          {action.departments[0] ? (
                            <span className={styles.pill}>{action.departments[0]}</span>
                          ) : null}
                          <span
                            className={`${styles.pill} ${styles[progress.statusOf(action.id)]}`}
                          >
                            {statusLabels[progress.statusOf(action.id)]}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
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
