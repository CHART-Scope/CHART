"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import {
  saveLearningProgress,
  type LearningResource,
  type LearningTrack,
} from "@/lib/learningClient";

import { groupCatalogue } from "./grouping";
import styles from "./LearningLibrary.module.css";
import { PlayerModal } from "./PlayerModal";
import { ResourceCard } from "./ResourceCard";
import { useLearningCatalogue } from "./useLearningCatalogue";

type ContentProps = {
  resources: readonly LearningResource[];
  tracks: readonly LearningTrack[];
  usingFallback?: boolean;
  /** Shows the dark planning band above the sections. */
  showPlanningBand?: boolean;
  onStartPlanning?: () => void;
  onWatched?: (resource: LearningResource, secondsWatched: number) => void;
};

/** Container: owns loading and the progress write. */
export function LearningLibrary({
  accessToken,
  onStartPlanning,
}: {
  accessToken?: string;
  onStartPlanning?: () => void;
}) {
  const { resources, tracks, usingFallback, phase } = useLearningCatalogue({
    accessToken,
  });

  const handleWatched = useCallback(
    (resource: LearningResource, secondsWatched: number) => {
      if (!accessToken) return;
      void saveLearningProgress(accessToken, {
        slug: resource.slug,
        secondsWatched,
      }).catch(() => {
        // Losing a progress ping is not worth interrupting the viewer.
      });
    },
    [accessToken],
  );

  if (phase === "loading") return <LearningLibrarySkeleton />;

  return (
    <LearningLibraryContent
      resources={resources}
      tracks={tracks}
      usingFallback={usingFallback}
      onStartPlanning={onStartPlanning}
      onWatched={handleWatched}
    />
  );
}

/** Pure presentation, driven entirely by props. Storybook renders this. */
export function LearningLibraryContent({
  resources,
  tracks,
  usingFallback = false,
  showPlanningBand = true,
  onStartPlanning,
  onWatched,
}: ContentProps) {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<string | null>(null);
  const [playing, setPlaying] = useState<LearningResource | null>(null);
  const openedAt = useRef<number | null>(null);

  // Grouped once against the search, so the place pills can show honest
  // counts even while a single place is selected.
  const sections = useMemo(
    () => groupCatalogue(resources, tracks, query),
    [resources, tracks, query],
  );
  const visible = place
    ? sections.filter((section) => section.label === place)
    : sections;
  // Distinct resources, not the sum of section counts — anything tagged with
  // two countries appears in both sections and would be counted twice.
  const total = new Set(
    sections.flatMap((section) =>
      section.modules.flatMap((module) => module.items.map((item) => item.slug)),
    ),
  ).size;

  const openPlayer = (resource: LearningResource) => {
    openedAt.current = Date.now();
    setPlaying(resource);
  };

  const handleClose = () => {
    if (playing && openedAt.current !== null) {
      // The YouTube embed does not report playback position without the
      // IFrame API, so time-with-the-player-open is the honest estimate.
      // Capped at the known duration; a click-and-close records ~nothing.
      const elapsed = Math.floor((Date.now() - openedAt.current) / 1000);
      const watched = playing.duration_seconds
        ? Math.min(elapsed, playing.duration_seconds)
        : elapsed;
      if (watched > 0) onWatched?.(playing, watched);
    }
    openedAt.current = null;
    setPlaying(null);
  };

  return (
    <div className={styles.page} data-source={usingFallback ? "fallback" : "api"}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <p className={styles.kicker}>Learning hub</p>
          <h1 className={styles.title}>Learn the case you need to make</h1>
          <p className={styles.lede}>
            Short, credible videos to help state and county health officers — and
            colleagues in other departments — understand climate-health risk and plan
            for it together.
          </p>
        </div>

        <label className={styles.search}>
          <Icon name="search" size={15} aria-hidden="true" />
          <span className={styles.srOnly}>Search videos</span>
          <input
            type="search"
            placeholder="Search videos"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      {showPlanningBand ? (
        <section className={styles.band} aria-labelledby="learning-band">
          <div className={styles.bandText}>
            <p className={styles.bandKicker}>Planning centre</p>
            <h2 id="learning-band" className={styles.bandTitle}>
              What would you like to plan for, together?
            </h2>
            <p className={styles.bandBody}>
              CHART will generate the shared risk picture, recommended actions and
              planning tools your departments can act on together.
            </p>
          </div>
          <button
            type="button"
            className={styles.bandCta}
            onClick={onStartPlanning}
            disabled={!onStartPlanning}
          >
            Start planning together
          </button>
        </section>
      ) : null}

      {sections.length > 1 ? (
        <div className={styles.jump} role="group" aria-label="Filter by place">
          <span className={styles.jumpLabel}>Place</span>
          <button
            type="button"
            className={styles.jumpPill}
            aria-pressed={place === null}
            data-selected={place === null || undefined}
            onClick={() => setPlace(null)}
          >
            All
            <span className={styles.jumpCount}>{total}</span>
          </button>
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={styles.jumpPill}
              aria-pressed={place === section.label}
              data-selected={place === section.label || undefined}
              onClick={() => setPlace(place === section.label ? null : section.label)}
            >
              {section.label}
              <span className={styles.jumpCount}>{section.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className={styles.empty} role="status">
          <p className={styles.emptyTitle}>Nothing here for “{query.trim()}”</p>
          <p className={styles.emptyBody}>
            Try a hazard (heat, flood), a country, or a body like WHO or the Red Cross.
          </p>
        </div>
      ) : (
        <div className={styles.sections}>
          {visible.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionKicker}>{section.kicker}</span>
                <span className={styles.sectionLabel}>{section.label}</span>
                {section.note ? (
                  <span className={styles.sectionNote}>{section.note}</span>
                ) : null}
              </div>

              <div className={styles.modules}>
                {section.modules.map((module) => (
                  <div key={`${section.id}-${module.slug}`}>
                    <div className={styles.moduleHead}>
                      <div>
                        <h2 className={styles.moduleTitle}>{module.title}</h2>
                        {module.subtitle ? (
                          <p className={styles.moduleSubtitle}>{module.subtitle}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.grid}>
                      {module.items.map((resource, index) => (
                        <ResourceCard
                          key={`${section.id}-${resource.slug}`}
                          resource={resource}
                          index={index}
                          onOpen={openPlayer}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <PlayerModal resource={playing} onClose={handleClose} />
    </div>
  );
}

function LearningLibrarySkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.skeletonHeader} />
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={styles.skeletonCard} />
        ))}
      </div>
      <p className={styles.srOnly} role="status">
        Loading the Learning hub.
      </p>
    </div>
  );
}
