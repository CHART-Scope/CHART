"use client";

import { useRef, useState } from "react";
import type { LearningResource } from "@/lib/learningClient";

export function useLearningPlayer(
  onWatched?: (resource: LearningResource, secondsWatched: number) => void,
) {
  const [playing, setPlaying] = useState<LearningResource | null>(null);
  const openedAt = useRef<number | null>(null);
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

  return { playing, openPlayer, handleClose };
}
