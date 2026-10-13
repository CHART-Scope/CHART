"use client";

import { useEffect, useRef, useState } from "react";

import { recordAuditEvent } from "@/lib/audit";
import { startPolling } from "@/lib/polling";
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
  /**
   * When set, the submission targets this admin_unit's own AppGeography.id
   * rather than the state-level geographyId. Picking a division in the
   * "Viewing for" dropdown flows through here so the prediction is scoped
   * to that division's admin_unit + its model binding.
   */
  adminUnit?: string | null;
  /** Skip triggering entirely, e.g. when the caller already has data. */
  disabled?: boolean;
};

const POLL_INTERVAL_MS = 5_000;
/** About ten minutes of checks, so a stuck request cannot poll forever. */
const MAX_POLLS = 120;

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
  adminUnit = null,
  disabled = false,
}: Options): AutoPredictionState {
  const effectiveGeographyId = adminUnit ?? geographyId;
  const [state, setState] = useState<AutoPredictionState>({
    phase: "idle",
    requestId: null,
    stage: null,
    error: null,
    completedAt: null,
  });
  // The token is read, not depended on: a rotation must not resubmit the
  // prediction or record another prediction_submitted audit event.
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  useEffect(() => {
    if (disabled) {
      setState({
        phase: "not_configured",
        requestId: null,
        stage: null,
        error: null,
        completedAt: null,
      });
      return;
    }
    if (!geographyId) return;

    const controller = new AbortController();
    const active = () => !controller.signal.aborted;
    const planningMonth = todayPlanningMonth();

    async function start() {
      setState((prev) => ({ ...prev, phase: "submitting", error: null }));
      try {
        const submitted = await submitPrediction(tokenRef.current ?? null, {
          geographyId: effectiveGeographyId,
          planningMonth,
          target: "month",
        });
        if (!active()) return;

        recordAuditEvent({
          event_type: "prediction_submitted",
          geography_id: effectiveGeographyId,
          prediction_request_id: submitted.request_id,
          payload: { planning_month: planningMonth, target: "month" },
        });

        if (isCompletedResult(submitted)) {
          setState({
            phase: "completed",
            requestId: submitted.request_id,
            stage: "completed",
            error: null,
            completedAt: new Date().toISOString(),
          });
          recordAuditEvent({
            event_type: "prediction_completed",
            geography_id: effectiveGeographyId,
            prediction_request_id: submitted.request_id,
          });
          return;
        }

        setState((prev) => ({
          ...prev,
          phase: submitted.status === "queued" ? "queued" : "running",
          requestId: submitted.request_id,
          stage: submitted.stage,
        }));
        pollUntilDone(submitted.request_id);
      } catch (error) {
        if (!active()) return;
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
        recordAuditEvent({
          event_type: "prediction_failed",
          geography_id: effectiveGeographyId,
          payload: { error: message },
        });
      }
    }

    function pollUntilDone(requestId: number) {
      startPolling({
        signal: controller.signal,
        intervalMs: POLL_INTERVAL_MS,
        maxAttempts: MAX_POLLS,
        onExhausted: () =>
          setState((prev) => ({
            ...prev,
            error:
              "This request has not finished after 10 minutes. Automatic checking has paused.",
          })),
        tick: async () => {
          try {
            const current: PredictionRequest = await getPredictionRequest(
              requestId,
              tokenRef.current ?? null,
            );
            if (!active()) return "stop";
            setState({
              phase: mapStatusToPhase(current.status),
              requestId,
              stage: current.stage,
              error: current.error_code ?? null,
              completedAt: current.status === "completed" ? current.updated_at : null,
            });
            if (current.status === "completed") {
              recordAuditEvent({
                event_type: "prediction_completed",
                geography_id: effectiveGeographyId,
                prediction_request_id: requestId,
              });
              return "stop";
            }
            if (current.status === "failed") {
              recordAuditEvent({
                event_type: "prediction_failed",
                geography_id: effectiveGeographyId,
                prediction_request_id: requestId,
                payload: { error_code: current.error_code ?? null },
              });
              return "stop";
            }
          } catch (error) {
            if (!active()) return "stop";
            setState((prev) => ({
              ...prev,
              error: error instanceof Error ? error.message : "Polling failed.",
            }));
          }
          return "continue";
        },
      });
    }

    void start();
    return () => controller.abort();
  }, [disabled, effectiveGeographyId, geographyId]);

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
