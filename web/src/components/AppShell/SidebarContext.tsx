"use client";

import { Skeleton } from "@/components/Skeleton";
import { usePlanningContext } from "@/lib/usePlanningContext";

import styles from "./SidebarContext.module.css";

export type SidebarContextProps = {
  loading?: boolean;
  /** The area being planned for. Absent means there is nothing to show and the
   * block renders nothing rather than an empty heading. */
  placeName?: string | null;
  levelLabel?: string | null;
  /** Ancestors, broadest first, excluding the place itself. */
  trail?: readonly string[];
  hazardLabel?: string | null;
  outcomeLabel?: string | null;
};

/**
 * The planning context, restated at the top of the sidebar.
 *
 * The dashboard cards already name the place and the outcome, but they scroll
 * away and the sidebar does not, so the one piece of chrome that is always on
 * screen used to be the only thing that could not say what the user was
 * looking at.
 *
 * Presentational on purpose: `SidebarPlanningContext` below does the reading,
 * which keeps every state of this block reachable from a story.
 */
export function SidebarContext({
  loading = false,
  placeName,
  levelLabel,
  trail,
  hazardLabel,
  outcomeLabel,
}: SidebarContextProps) {
  if (loading) {
    return (
      <div
        className={styles.block}
        role="status"
        aria-label="Loading your planning context"
      >
        <Skeleton className={styles.shimmer} width="4.5rem" height="0.5rem" />
        <Skeleton className={styles.shimmer} width="85%" height="1rem" />
        <Skeleton className={styles.shimmer} width="65%" height="0.6rem" />
        <Skeleton
          className={styles.shimmer}
          width="80%"
          height="1.25rem"
          radius="full"
        />
      </div>
    );
  }

  if (!placeName) return null;

  const trailText = (trail ?? []).filter(Boolean).join(" › ");
  // Hazard and outcome are two halves of one sentence ("extreme heat, and what
  // it does to low birth weight"), so they read as a single chip rather than
  // two badges competing for the narrow column.
  const chip = [hazardLabel, outcomeLabel].filter(Boolean).join(" · ");

  return (
    <section className={styles.block} aria-label="Planning context">
      <p className={styles.eyebrow}>Planning for</p>
      <p
        className={styles.place}
        title={levelLabel ? `${placeName} (${levelLabel})` : placeName}
      >
        {placeName}
      </p>
      {trailText ? (
        <p className={styles.trail} title={trailText}>
          {trailText}
        </p>
      ) : null}
      {chip ? (
        <p className={styles.chip} title={chip}>
          {chip}
        </p>
      ) : null}
    </section>
  );
}

/** Reads the live context and renders the block above. Split out so the shell
 * can drop it behind a Suspense boundary — `usePlanningContext` reads the
 * search params, which a statically rendered page may not have yet. */
export function SidebarPlanningContext() {
  const context = usePlanningContext();
  if (context.status === "none") return null;
  if (context.status === "loading") return <SidebarContext loading />;
  return (
    <SidebarContext
      placeName={context.placeName}
      levelLabel={context.levelLabel}
      trail={context.trail}
      hazardLabel={context.hazardLabel}
      outcomeLabel={context.outcomeLabel}
    />
  );
}
