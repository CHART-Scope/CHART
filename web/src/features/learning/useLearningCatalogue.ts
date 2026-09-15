"use client";

import { useEffect, useState } from "react";

import {
  listLearningResources,
  listLearningTracks,
  type LearningResource,
  type LearningTrack,
} from "@/lib/learningClient";

import { FALLBACK_RESOURCES, FALLBACK_TRACKS } from "./data/fallback";

export type CataloguePhase = "loading" | "ready" | "failed";

/**
 * Loads the public catalogue and the track vocabulary that titles each module.
 *
 * Starts from the checked-in fallback so the hub paints immediately and never
 * shows an empty page; `usingFallback` reports whether live data arrived.
 *
 * Nothing here reads `/learning/me`. Watch progress is still written when a
 * player closes, but the page renders no per-user rows, so fetching it would
 * only risk replacing good fallback data with an empty response.
 */
export function useLearningCatalogue({ accessToken }: { accessToken?: string }) {
  const [resources, setResources] =
    useState<readonly LearningResource[]>(FALLBACK_RESOURCES);
  const [tracks, setTracks] = useState<readonly LearningTrack[]>(FALLBACK_TRACKS);
  const [usingFallback, setUsingFallback] = useState(true);
  const [phase, setPhase] = useState<CataloguePhase>("loading");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [catalogue, trackList] = await Promise.all([
          listLearningResources({ limit: 200 }, controller.signal),
          listLearningTracks(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        // An empty response means the seed never ran; keep what we shipped.
        if (catalogue.items.length > 0) {
          setResources(catalogue.items);
          setUsingFallback(false);
        }
        if (trackList.length > 0) setTracks(trackList);
        setPhase("ready");
      } catch {
        // The seeded fallback stays on screen; the hub is still usable.
        if (!controller.signal.aborted) setPhase("ready");
      }
    }

    void load();
    return () => controller.abort();
  }, [accessToken]);

  return { resources, tracks, usingFallback, phase };
}
