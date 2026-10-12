"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchMonthlyRisk, type MonthlyRiskResponse } from "@/lib/dashboardClient";
import {
  getPredictionRequest,
  submitPrediction,
  predictionErrorMessage,
  type PredictionStage,
} from "@/lib/planningClient";

type Phase = "loading" | "preparing" | "ready" | "failed";

const POLL_INTERVAL_MS = 5000;
/** Stop polling after ~10 minutes so a stuck request cannot spin forever. */
const MAX_POLLS = 120;

function monthIsReady(data: MonthlyRiskResponse | null, month: string) {
  const entry = data?.months[month];
  if (!entry) return false;
  return Boolean(entry.temperature && entry.prediction);
}

/**
 * Monthly temperature + risk for one place.
 *
 * The endpoint returns every month in a single payload, so the read is keyed
 * on the geography alone — switching month reads from data already in memory
 * rather than refetching. Only preparing a month that has no result yet is
 * month-specific, and that runs in its own effect.
 */
export function useMonthlyRisk({
  geographyId,
  accessToken,
  month,
  canPrepare,
  outcome,
}: {
  geographyId: string;
  accessToken: string;
  month: string;
  canPrepare: boolean;
  /** Which health outcome to read and to queue. Must match the model the card
   * is labelled with; omitting it let the endpoint fall back to low birth
   * weight while the card said under-five mortality. */
  outcome?: string;
}) {
  const scopeKey = `${geographyId}:${outcome}:${accessToken}`;
  const [result, setResult] = useState<{
    key: string;
    data: MonthlyRiskResponse;
  } | null>(null);
  const data = result?.key === scopeKey ? result.data : null;
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  // Which half of the pipeline is running. The queued job fetches
  // observations and then scores them, and those take very different
  // amounts of time, so "preparing" alone tells a user almost nothing.
  const [stage, setStage] = useState<PredictionStage | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Each month's submission, kept across month switches so re-selecting a
  // month resumes polling its request instead of queueing a second run. A
  // month is removed again if its request fails - without the removal a
  // single expired lease poisoned the month for the whole visit, and
  // reselecting it re-rendered the stale failure without sending anything.
  const submitted = useRef<Map<string, ReturnType<typeof submitPrediction>>>(new Map());
  // The prepare effect below polls, and polling refreshes `data`. Depending
  // on `data` therefore made the effect tear itself down mid-poll: the
  // cleanup aborted the controller the running poll was checking, so the
  // month stayed "preparing" forever. It reads the months through this ref
  // and re-runs only when a *new* read lands.
  const dataRef = useRef<MonthlyRiskResponse | null>(null);
  const [reads, setReads] = useState(0);

  const applyData = useCallback(
    (next: MonthlyRiskResponse) => {
      dataRef.current = next;
      setResult({ key: scopeKey, data: next });
    },
    [scopeKey],
  );

  const fail = useCallback((cause: unknown, fallbackMessage: string) => {
    setError(cause instanceof Error ? cause.message : fallbackMessage);
    setPhase("failed");
  }, []);

  // Read: one fetch per geography, not per month.
  useEffect(() => {
    // The dashboard withholds the token until the model catalog resolves, and
    // that call can take several seconds. Fetching in the meantime sent no
    // authorization header at all, so the request came back 401 and the panel
    // rendered a failure for what was only a slow catalog. Staying in
    // "loading" is the truthful state: this effect re-runs with the token the
    // moment it arrives.
    if (!geographyId || !accessToken) {
      setPhase("loading");
      setError(null);
      setRequestId(null);
      return;
    }
    const controller = new AbortController();
    submitted.current = new Map();
    // Forget the previous place's months. `data` itself is left alone so the
    // card keeps showing something while the new read lands, but judging
    // "does this month need preparing" against another geography's answers
    // would either skip a needed run or queue an unneeded one.
    dataRef.current = null;
    setPhase("loading");
    setError(null);
    setRequestId(null);
    setStage(null);
    setLastChecked(null);
    fetchMonthlyRisk(geographyId, accessToken, controller.signal, outcome)
      .then((latest) => {
        if (controller.signal.aborted) return;
        applyData(latest);
        setReads((value) => value + 1);
        setPhase("ready");
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        fail(cause, "Monthly temperature and risk could not be loaded.");
      });
    return () => controller.abort();
  }, [geographyId, accessToken, attempt, fail, outcome, applyData]);

  // Prepare: only when the selected month has no result yet.
  useEffect(() => {
    const known = dataRef.current;
    if (!canPrepare || known === null) return;
    // A month is the whole subject of the request. Submitting without one
    // sent planning_date "-01", which the API rejected as an invalid date.
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    if (monthIsReady(known, month)) {
      setPhase("ready");
      return;
    }
    setError(null);
    setLastChecked(null);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = () => !controller.signal.aborted;
    // Let the month be asked for again. Every failure here is transient from
    // the reader's side: a lease expired, observations were missing, the
    // scorer was down.
    const failMonth = (cause: unknown, fallbackMessage: string) => {
      submitted.current.delete(month);
      fail(cause, fallbackMessage);
    };

    const refresh = async () => {
      const latest = await fetchMonthlyRisk(
        geographyId,
        accessToken,
        controller.signal,
        outcome,
      );
      if (active()) applyData(latest);
      return latest;
    };
    const finish = async () => {
      const latest = await refresh();
      if (!active()) return;
      if (!latest.months[month]?.prediction) {
        throw new Error(
          "The calculation completed but its monthly result could not be read.",
        );
      }
      setPhase("ready");
    };
    const poll = async (id: number, polls = 0) => {
      try {
        const request = await getPredictionRequest(id, accessToken);
        if (!active()) return;
        setStage(request.stage ?? null);
        setLastChecked(Date.now());
        if (request.status === "completed") {
          await finish();
        } else if (request.status === "failed") {
          throw new Error(predictionErrorMessage(request.error_code));
        } else if (polls >= MAX_POLLS) {
          throw new Error(
            "This request has not finished after 10 minutes. Automatic checking has paused. Check again to reconnect to its latest status.",
          );
        } else {
          // Observations may become available before the model finishes.
          const latest = await refresh();
          if (active() && monthIsReady(latest, month)) {
            setPhase("ready");
            setStage("completed");
            return;
          }
          if (active()) {
            timer = setTimeout(() => void poll(id, polls + 1), POLL_INTERVAL_MS);
          }
        }
      } catch (cause) {
        if (active()) failMonth(cause, "Monthly preparation failed.");
      }
    };
    const prepare = async () => {
      try {
        setPhase("preparing");
        setStage("queued");
        let submission = submitted.current.get(month);
        if (!submission) {
          submission = submitPrediction(accessToken, {
            geographyId,
            planningMonth: month,
            target: "month",
            outcome,
          });
          submitted.current.set(month, submission);
        }
        const request = await submission;
        if (!active()) return;
        setRequestId(request.request_id);
        if ("request_status" in request) await finish();
        else await poll(request.request_id);
      } catch (cause) {
        if (active()) failMonth(cause, "Monthly preparation failed.");
      }
    };
    void prepare();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [geographyId, accessToken, month, canPrepare, reads, fail, outcome, applyData]);

  return {
    data,
    phase:
      data === null ? ((phase === "failed" ? "failed" : "loading") as Phase) : phase,
    error,
    requestId,
    stage,
    lastChecked,
    retry: () => setAttempt((value) => value + 1),
  };
}

export function recentCompleteMonths(now = new Date()): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12 + index, 1),
    );
    return date.toISOString().slice(0, 7);
  });
}
