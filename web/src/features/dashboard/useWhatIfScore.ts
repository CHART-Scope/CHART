"use client";

import { useEffect, useRef, useState } from "react";

import { recordAuditEvent } from "@/lib/audit";
import { submitWhatIfScore, type WhatIfScore } from "@/lib/planningClient";

export type WhatIfScoreState = {
  score: WhatIfScore | null;
  loading: boolean;
  error: string | null;
};

type Options = {
  geographyId: string | undefined;
  accessToken: string | undefined;
  temperatureC: number;
  debounceMs?: number;
};

/**
 * Debounce the slider, cache by (geo, T) so re-drags to a prior position
 * are free, and cancel in-flight calls when the user keeps dragging. This
 * is the slider-side counterpart to ``useAutoPrediction`` — that hook
 * queues a durable, DB-persisted run; this one hits the on-demand
 * ``/climate/what-if`` endpoint with no persistence.
 */
export function useWhatIfScore({
  geographyId,
  accessToken,
  temperatureC,
  debounceMs = 250,
}: Options): WhatIfScoreState {
  const [state, setState] = useState<WhatIfScoreState>({
    score: null,
    loading: false,
    error: null,
  });
  const cache = useRef(new Map<string, WhatIfScore>());
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!geographyId || !accessToken) return;
    const rounded = Math.round(temperatureC * 2) / 2;
    const key = `${geographyId}:${rounded.toFixed(1)}`;

    const cached = cache.current.get(key);
    if (cached) {
      setState({ score: cached, loading: false, error: null });
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    if (abort.current) abort.current.abort();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    timer.current = setTimeout(() => {
      const controller = new AbortController();
      abort.current = controller;
      submitWhatIfScore(
        accessToken,
        { geographyId, temperatureC: rounded },
        { signal: controller.signal },
      )
        .then((score) => {
          if (controller.signal.aborted) return;
          cache.current.set(key, score);
          setState({ score, loading: false, error: null });
          recordAuditEvent({
            event_type: "whatif_tick",
            geography_id: geographyId,
            payload: {
              temperature_c: rounded,
              af_percent: score.attributable_fraction_percent,
              odds_ratio: score.odds_ratio,
              on_training_support: score.on_training_support,
              pregnancy_window: score.pregnancy_window,
              model_version: score.model_version,
            },
          });
          if (settleTimer.current) clearTimeout(settleTimer.current);
          settleTimer.current = setTimeout(() => {
            recordAuditEvent({
              event_type: "whatif_settled",
              geography_id: geographyId,
              payload: {
                temperature_c: rounded,
                af_percent: score.attributable_fraction_percent,
                odds_ratio: score.odds_ratio,
              },
            });
          }, 2_000);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setState({
            score: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "The what-if score could not be calculated.",
          });
        });
    }, debounceMs);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [geographyId, accessToken, temperatureC, debounceMs]);

  return state;
}
