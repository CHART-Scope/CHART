"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GeographyRecord } from "../../lib/geographyClient";
import {
  getPlanningOptions,
  getPredictionRequest,
  listPredictionRequests,
  predictionErrorMessage,
  submitLbwPrediction,
  type ClimateMonth,
  type PlanningOptions,
  type PlanningTarget,
  type PredictionRequestSummary,
  type PredictionResult,
  type PredictionStage,
  type PredictionStatus,
} from "../../lib/predictionClient";
import { Button } from "../ui/Button";
import { DataCard } from "../ui/DataCard";
import { ClimateTrace } from "./ClimateTrace";
import { CumulativePlanningResult } from "./CumulativePlanningResult";
import { PredictionRunHistory } from "./PredictionRunHistory";

type PredictionPipelineCardProps = {
  accessToken?: string;
  canRun: boolean;
  geography?: GeographyRecord;
};

type PipelineProgress = {
  requestId: number | null;
  planningDate?: string | null;
  status: PredictionStatus;
  stage: PredictionStage;
  dagsterRunId?: string | null;
  sourceAsOf?: string | null;
  availableFrom?: string | null;
  errorCode?: string | null;
  climate: ClimateMonth[];
  result?: PredictionResult | null;
};

type PlanningMode = "next_three_months" | "next_heat_season" | "long_term" | "custom";
type ProjectionScenario = "ssp126" | "ssp370" | "ssp585";

const stages: { id: PredictionStage; label: string }[] = [
  { id: "queued", label: "Queued" },
  { id: "preparing_climate", label: "Getting climate data" },
  { id: "climate_ready", label: "Three months checked" },
  { id: "predicting", label: "Calculating the model result" },
  { id: "completed", label: "Completed" },
];

export function PredictionPipelineCard({
  accessToken,
  canRun,
  geography,
}: PredictionPipelineCardProps) {
  const restoredRun = useRef(false);
  const [planningMonth, setPlanningMonth] = useState(monthOffset(3));
  const [planningMode, setPlanningMode] = useState<PlanningMode>("next_three_months");
  const [projectionScenario, setProjectionScenario] = useState<ProjectionScenario | "">(
    "",
  );
  const [planningOptions, setPlanningOptions] = useState<PlanningOptions | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [recentRuns, setRecentRuns] = useState<PredictionRequestSummary[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectRun = useCallback((run: PredictionRequestSummary) => {
    restoredRun.current = true;
    setError(null);
    setProgress(progressFromSummary(run));
    setRequestId(run.request_id);
    setPlanningMonth(run.planning_date.slice(0, 7));
    setProjectionScenario(run.projection_scenario ?? "");
    setPlanningMode(modeFromTarget(run.planning_target));
  }, []);

  const refreshRecentRuns = useCallback(async () => {
    if (!geography?.id || !geography.supportsPrediction) return [];
    const response = await listPredictionRequests(geography.id, accessToken);
    setRecentRuns(response.items);
    return response.items;
  }, [accessToken, geography?.id, geography?.supportsPrediction]);

  useEffect(() => {
    restoredRun.current = false;
    setProgress(null);
    setRequestId(null);
    setRecentRuns([]);
    setError(null);
    setPlanningMode("next_three_months");
    setProjectionScenario("");
    if (!geography?.id || !geography.supportsPrediction) return;

    let cancelled = false;
    setIsLoadingRuns(true);
    listPredictionRequests(geography.id, accessToken)
      .then((response) => {
        if (cancelled) return;
        setRecentRuns(response.items);
        const latest =
          response.items.find(
            (item) => item.status === "queued" || item.status === "running",
          ) ??
          response.items.find((item) => item.status === "completed") ??
          response.items[0];
        if (latest) selectRun(latest);
      })
      .catch((historyError) => {
        if (!cancelled) {
          setError(
            historyError instanceof Error
              ? historyError.message
              : "Saved plans could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRuns(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, geography?.id, geography?.supportsPrediction, selectRun]);

  useEffect(() => {
    if (!geography?.id || !geography.supportsPrediction) {
      setPlanningOptions(null);
      return;
    }
    let cancelled = false;
    setPlanningOptions(null);

    getPlanningOptions(geography.id, accessToken)
      .then((options) => {
        if (cancelled) return;
        setPlanningOptions(options);
        if (!restoredRun.current) {
          setPlanningMode("next_three_months");
          setPlanningMonth(options.next_three_months.planning_date.slice(0, 7));
        }
      })
      .catch((planningError) => {
        if (!cancelled) {
          setError(
            planningError instanceof Error
              ? planningError.message
              : "Planning choices could not be loaded.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, geography?.id, geography?.supportsPrediction]);

  useEffect(() => {
    if (requestId === null) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    async function poll() {
      try {
        const next = await getPredictionRequest(requestId as number, accessToken);
        if (cancelled) return;
        setProgress({
          requestId: next.request_id,
          planningDate: next.planning_date,
          status: next.status,
          stage: next.stage,
          dagsterRunId: next.dagster_run_id,
          sourceAsOf: next.source_as_of,
          availableFrom: next.available_from,
          errorCode: next.error_code,
          climate: next.climate,
          result: next.result,
        });
        if (next.status === "queued" || next.status === "running") {
          timeoutId = window.setTimeout(poll, 3000);
        } else if (next.status === "waiting") {
          timeoutId = window.setTimeout(poll, 60000);
        } else {
          void refreshRecentRuns();
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Planning estimate status could not be loaded.",
          );
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [accessToken, refreshRecentRuns, requestId]);

  const stageIndex = useMemo(
    () => stages.findIndex((stage) => stage.id === progress?.stage),
    [progress?.stage],
  );
  const climate = progress?.result?.climate ?? progress?.climate ?? [];
  const cumulativeWindowAvailable =
    planningOptions?.validated_pregnancy_windows.includes(1) ?? false;
  const prediction = progress?.result
    ? (progress.result.predictions.find((item) => item.pregnancy_window === 1) ??
      progress.result.prediction)
    : null;
  const hasActiveRun =
    progress?.status === "queued" ||
    progress?.status === "running" ||
    recentRuns.some((run) => run.status === "queued" || run.status === "running");
  const nextThreeMonths = planningOptions?.next_three_months;
  const nextHeatSeason = planningOptions?.next_heat_season;
  const longTermProjection = planningOptions?.long_term_projection;
  const customMinimum = planningOptions?.custom_min_month.slice(0, 7);
  const customMaximum = planningOptions?.custom_max_month.slice(0, 7);
  const target = targetFromMode(planningMode);
  const isSelectedPlanWaiting =
    progress?.status === "waiting" &&
    progress.planningDate?.slice(0, 7) === planningMonth &&
    planningMode === "next_heat_season";
  const canSubmit =
    planningOptions !== null &&
    cumulativeWindowAvailable &&
    (planningMode === "next_three_months"
      ? Boolean(nextThreeMonths)
      : planningMode === "next_heat_season"
        ? Boolean(nextHeatSeason)
        : planningMode === "long_term"
          ? Boolean(longTermProjection && projectionScenario)
          : Boolean(
              customMinimum &&
              customMaximum &&
              planningMonth >= customMinimum &&
              planningMonth <= customMaximum,
            ));

  async function runPrediction() {
    if (!geography) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await submitLbwPrediction(
        geography.id,
        planningMonth,
        accessToken,
        {
          target,
          pregnancyWindows: [1],
          projection:
            planningMode === "long_term" && projectionScenario && longTermProjection
              ? {
                  scenario: projectionScenario,
                  period: longTermProjection.period,
                }
              : undefined,
        },
      );
      if ("status_url" in response) {
        setProgress({
          requestId: response.request_id,
          planningDate: response.planning_date,
          status: response.status,
          stage: response.stage,
          sourceAsOf: response.source_as_of,
          availableFrom: response.available_from,
          climate: [],
        });
        setRequestId(response.request_id);
      } else {
        setProgress({
          requestId: response.request_id,
          planningDate: response.planning_date,
          status: "completed",
          stage: "completed",
          climate: response.climate,
          result: response,
          sourceAsOf: response.source_as_of,
        });
        setRequestId(response.request_id);
      }
      await refreshRecentRuns();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The planning estimate could not be started.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DataCard
      eyebrow="Climate-health planning"
      title="Heat and low birth weight"
      actions={
        geography?.supportsPrediction && canRun ? (
          <Button
            compact
            variant="green"
            disabled={
              isSubmitting || hasActiveRun || !canSubmit || isSelectedPlanWaiting
            }
            onClick={runPrediction}
          >
            {isSubmitting
              ? "Starting…"
              : hasActiveRun
                ? "Calculating…"
                : isSelectedPlanWaiting
                  ? "Plan saved"
                  : planningMode === "next_heat_season" && !nextHeatSeason?.available
                    ? "Save plan"
                    : "Check period"}
          </Button>
        ) : null
      }
    >
      {!geography ? (
        <p className="prediction-pipeline-note">Choose an area first.</p>
      ) : !geography.supportsPrediction ? (
        <p className="prediction-pipeline-note">
          A low-birth-weight model has not been added for {geography.name} yet.
        </p>
      ) : !canRun ? (
        <p className="prediction-pipeline-note">
          Your role can view saved estimates but cannot create them.
        </p>
      ) : (
        <>
          <p className="prediction-pipeline-intro">
            Choose the place and time. CHART retrieves three monthly temperatures,
            records their source, and runs one cumulative low-birth-weight planning
            check.
          </p>

          <div className="planner-choice-grid" aria-label="Planning period">
            <PlanningChoice
              selected={planningMode === "next_three_months"}
              title="Next 3 months"
              description={
                nextThreeMonths
                  ? nextThreeMonths.months.map(formatApiMonth).join(" · ")
                  : "Loading dates…"
              }
              status="Seasonal forecast available now"
              onClick={() => {
                if (!nextThreeMonths) return;
                setPlanningMode("next_three_months");
                setPlanningMonth(nextThreeMonths.planning_date.slice(0, 7));
                setProjectionScenario("");
              }}
            />
            {nextHeatSeason ? (
              <PlanningChoice
                selected={planningMode === "next_heat_season"}
                title="Next hot season"
                description={nextHeatSeason.months.map(formatApiMonth).join(" · ")}
                status={
                  nextHeatSeason.available
                    ? "Seasonal forecast available now"
                    : `Save now · updates automatically from ${formatDay(nextHeatSeason.available_from)}`
                }
                onClick={() => {
                  setPlanningMode("next_heat_season");
                  setPlanningMonth(nextHeatSeason.planning_date.slice(0, 7));
                  setProjectionScenario("");
                }}
              />
            ) : null}
            {longTermProjection ? (
              <PlanningChoice
                selected={planningMode === "long_term"}
                title="Long-term heat"
                description="Typical March–May conditions in 2031–2040"
                status="Explore possible climate futures"
                onClick={() => {
                  setPlanningMode("long_term");
                  setPlanningMonth(longTermProjection.planning_date.slice(0, 7));
                }}
              />
            ) : null}
          </div>

          {planningMode === "long_term" && longTermProjection ? (
            <label className="prediction-month-field">
              <span>Future climate assumption</span>
              <select
                value={projectionScenario}
                onChange={(event) =>
                  setProjectionScenario(event.target.value as ProjectionScenario | "")
                }
              >
                <option value="">Choose one</option>
                {longTermProjection.scenarios.map((scenario) => (
                  <option key={scenario.value} value={scenario.value}>
                    {scenario.label}
                  </option>
                ))}
              </select>
              <small>
                These are possible futures, not a forecast of which future will happen.
              </small>
            </label>
          ) : null}

          <details className="planner-more-options" open={planningMode === "custom"}>
            <summary>More options</summary>
            <button
              type="button"
              aria-pressed={planningMode === "custom"}
              onClick={() => {
                setPlanningMode("custom");
                setProjectionScenario("");
              }}
            >
              Choose a specific month
            </button>
            {planningMode === "custom" ? (
              <label className="prediction-month-field">
                <span>Planning month</span>
                <input
                  type="month"
                  value={planningMonth}
                  min={customMinimum}
                  max={customMaximum}
                  onChange={(event) => setPlanningMonth(event.target.value)}
                />
                <small>
                  Available from {customMinimum ? formatMonth(customMinimum) : "…"} to{" "}
                  {customMaximum ? formatMonth(customMaximum) : "…"}.
                </small>
              </label>
            ) : null}
          </details>

          {isSelectedPlanWaiting ? (
            <div className="prediction-waiting-plan" role="status">
              <strong>Your next-hot-season plan is saved.</strong>
              <span>
                CHART will collect the real seasonal forecast and calculate the estimate
                automatically
                {progress.availableFrom
                  ? ` from ${formatDay(progress.availableFrom)}`
                  : " when it is published"}
                .
              </span>
            </div>
          ) : null}

          <PredictionRunHistory
            items={recentRuns}
            selectedRequestId={requestId}
            isLoading={isLoadingRuns}
            onSelect={selectRun}
          />

          {progress && progress.status !== "waiting" ? (
            <ol className="prediction-stage-list" aria-label="Estimate progress">
              {stages.map((stage, index) => (
                <li
                  key={stage.id}
                  className={`prediction-stage prediction-stage-${getStageState(
                    progress,
                    index,
                    stageIndex,
                  )}`}
                >
                  <span aria-hidden="true" />
                  {progress.status === "failed" && index === stages.length - 1
                    ? "Failed"
                    : stage.label}
                </li>
              ))}
            </ol>
          ) : null}

          {progress?.status !== "waiting" && climate.length > 0 ? (
            <ClimateTrace rows={climate} />
          ) : null}
          <CumulativePlanningResult prediction={prediction} />

          {progress?.status === "failed" ? (
            <p className="prediction-pipeline-error" role="alert">
              {predictionErrorMessage(progress.errorCode)}
            </p>
          ) : null}
          {error ? (
            <p className="prediction-pipeline-error" role="alert">
              {error}
            </p>
          ) : null}
          {progress?.requestId ? (
            <small className="prediction-run-reference">
              Request {progress.requestId}
              {progress.dagsterRunId
                ? ` · Data run ${progress.dagsterRunId.slice(0, 8)}`
                : ""}
              {progress.sourceAsOf
                ? ` · Sources checked for ${progress.sourceAsOf}`
                : ""}
            </small>
          ) : null}
        </>
      )}
    </DataCard>
  );
}

function PlanningChoice({
  selected,
  title,
  description,
  status,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  status: string;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}>
      <strong>{title}</strong>
      <span>{description}</span>
      <small>{status}</small>
    </button>
  );
}

function modeFromTarget(target: PlanningTarget): PlanningMode {
  if (target === "next_three_months") return "next_three_months";
  if (target === "next_heat_season") return "next_heat_season";
  if (target === "long_term_hot_season") return "long_term";
  return "custom";
}

function targetFromMode(mode: PlanningMode): PlanningTarget {
  if (mode === "next_three_months") return "next_three_months";
  if (mode === "next_heat_season") return "next_heat_season";
  if (mode === "long_term") return "long_term_hot_season";
  return "month";
}

function monthOffset(offset: number) {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
}

function formatApiMonth(value: string) {
  return formatMonth(value.slice(0, 7));
}

function formatDay(value?: string | null) {
  if (!value) return "the publication date";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function progressFromSummary(run: PredictionRequestSummary): PipelineProgress {
  return {
    requestId: run.request_id,
    planningDate: run.planning_date,
    status: run.status,
    stage: run.stage,
    sourceAsOf: run.source_as_of,
    availableFrom: run.available_from,
    errorCode: run.error_code,
    climate: [],
  };
}

function getStageState(
  progress: PipelineProgress,
  index: number,
  currentIndex: number,
) {
  if (progress.status === "failed") {
    return index === stages.length - 1
      ? "failed"
      : index === 0
        ? "complete"
        : "pending";
  }
  if (index < currentIndex || progress.status === "completed") return "complete";
  return index === currentIndex ? "active" : "pending";
}
