"use client";

import { useEffect, useRef, useState } from "react";

import {
  getPredictionRequest,
  submitPrediction,
  type PredictionRequest,
} from "@/lib/planningClient";

export type AutoPredictionPhase =
  | "idle"
  | "submitting"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "not_configured";

export type AutoPredictionState = {
  phase: AutoPredictionPhase;
  requestId: number | null;
  stage: string | null;
  error: string | null;
  completedAt: string | null;
};

type Options = {
  geographyId: string;
  accessToken: string;
  /** Skip triggering entirely, e.g. when the caller already has data. */
  disabled?: boolean;
};

const POLL_INTERVAL_MS = 5_000;

/**
 * Submit one LBW prediction for today's planning date on mount and poll
 * until it completes or fails. Reuses the existing planning-flow
 * primitives so the dashboard does not need a bespoke backend contract.
 *
 * The submission is idempotent server-side (SHA-256 request key), so
 * mounting the hook twice with the same inputs coalesces to one row.
 */
export function useAutoPrediction({
  geographyId,
  accessToken,
  disabled = false,
}: Options): AutoPredictionState {
  const [state, setState] = useState<AutoPredictionState>({
    phase: "idle",
    requestId: null,
    stage: null,
    error: null,
    completedAt: null,
  });
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cancelled.current = false;
    if (disabled) {
      setState({
        phase: "not_configured",
        requestId: null,
        stage: null,
        error: null,
        completedAt: null,
      });
      return () => {
        cancelled.current = true;
        if (timer.current) clearTimeout(timer.current);
      };
    }
    if (!geographyId) {
      return () => {
        cancelled.current = true;
        if (timer.current) clearTimeout(timer.current);
      };
    }

    const planningMonth = todayPlanningMonth();

    async function start() {
      setState((prev) => ({ ...prev, phase: "submitting", error: null }));
      try {
        const submitted = await submitPrediction(accessToken, {
          geographyId,
          planningMonth,
          target: "month",
        });

        if (isCompletedResult(submitted)) {
          if (!cancelled.current) {
            setState({
              phase: "completed",
              requestId: submitted.request_id,
              stage: "completed",
              error: null,
              completedAt: new Date().toISOString(),
            });
          }
          return;
        }

        const accepted = submitted;
        setState((prev) => ({
          ...prev,
          phase: accepted.status === "queued" ? "queued" : "running",
          requestId: accepted.request_id,
          stage: accepted.stage,
        }));
        pollUntilDone(accepted.request_id);
      } catch (error) {
        if (cancelled.current) return;
        const message =
          error instanceof Error
            ? error.message
            : "The prediction could not be started.";
        setState({
          phase: isNotConfigured(message) ? "not_configured" : "failed",
          requestId: null,
          stage: null,
          error: message,
          completedAt: null,
        });
      }
    }

    function pollUntilDone(requestId: number) {
      const tick = async () => {
        if (cancelled.current) return;
        try {
          const current: PredictionRequest = await getPredictionRequest(
            requestId,
            accessToken,
          );
          if (cancelled.current) return;
          const phase = mapStatusToPhase(current.status);
          setState({
            phase,
            requestId,
            stage: current.stage,
            error: current.error_code ?? null,
            completedAt: current.status === "completed" ? current.updated_at : null,
          });
          if (current.status === "completed" || current.status === "failed") {
            return;
          }
        } catch (error) {
          if (cancelled.current) return;
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Polling failed.",
          }));
        }
        timer.current = setTimeout(tick, POLL_INTERVAL_MS);
      };
      timer.current = setTimeout(tick, POLL_INTERVAL_MS);
    }

    void start();

    return () => {
      cancelled.current = true;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [accessToken, disabled, geographyId]);

  return state;
}

const NOT_CONFIGURED_CODES = new Set([
  "MODEL_NOT_AVAILABLE_FOR_PLACE",
  "MODEL_RELEASE_NOT_AVAILABLE_FOR_PLACE",
  "CLIMATE_NOT_CONFIGURED_FOR_PLACE",
]);

function isNotConfigured(message: string): boolean {
  for (const code of NOT_CONFIGURED_CODES) {
    if (message.includes(code)) return true;
  }
  return false;
}

function isCompletedResult(
  value: Awaited<ReturnType<typeof submitPrediction>>,
): value is Extract<typeof value, { request_status: "completed" }> {
  return (
    typeof (value as { request_status?: unknown }).request_status === "string" &&
    (value as { request_status?: unknown }).request_status === "completed"
  );
}

function todayPlanningMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function mapStatusToPhase(status: PredictionRequest["status"]): AutoPredictionPhase {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "running":
      return "running";
    case "queued":
    case "waiting":
    default:
      return "queued";
  }
}
