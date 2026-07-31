"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell, type NavItem } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import {
  getPlanningOptions,
  getPredictionRequest,
  listGeographies,
  listPredictionRequests,
  submitPrediction,
  type GeographyRecord,
  type PlanningOptions,
  type PredictionRequest,
  type PredictionResult,
  type PredictionSummary,
} from "@/lib/planningClient";
import { PlanningResult } from "./PlanningResult";
import { PlanningSetup } from "./PlanningSetup";
import {
  defaultPlanningSelection,
  planningMonth,
  selectionFromRequest,
  targetForPeriod,
  type PlanningSelection,
} from "./planningWireframe";
import { UserManagement } from "./UserManagement";

type View = "planning" | "result" | "users";

const planningNav: NavItem = {
  id: "planning",
  label: "Start planning",
  icon: "users",
};

type Props = {
  accessToken: string;
  username: string;
  roles: string[];
  geographyScopes: string[];
  activeGeographyId?: string;
  onSignOut: () => void;
};

export function PlanningApp({
  accessToken,
  username,
  roles,
  geographyScopes,
  activeGeographyId,
  onSignOut,
}: Props) {
  const restored = useRef(false);
  const [view, setView] = useState<View>("planning");
  const [selection, setSelection] = useState<PlanningSelection>(
    defaultPlanningSelection,
  );
  const [areas, setAreas] = useState<GeographyRecord[]>([]);
  const [options, setOptions] = useState<PlanningOptions | null>(null);
  const [run, setRun] = useState<PredictionRequest | null>(null);
  const [history, setHistory] = useState<PredictionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav: NavItem[] = roles.includes("chart_admin")
    ? [planningNav, { id: "users", label: "People & access", icon: "settings" }]
    : [planningNav];

  const refreshHistory = useCallback(
    async (geographyId: string) => {
      const items = await listPredictionRequests(geographyId, accessToken);
      setHistory(items);
      return items;
    },
    [accessToken],
  );

  const openRun = useCallback(
    async (summary: PredictionSummary) => {
      setError(null);
      const request = await getPredictionRequest(summary.request_id, accessToken);
      setRun(request);
      setSelection(selectionFromRequest(request));
      setView("result");
    },
    [accessToken],
  );

  useEffect(() => {
    let cancelled = false;
    listGeographies()
      .then((records) => {
        if (cancelled) return;
        const available = records
          .filter((area) => area.supportsPrediction)
          .filter((area) => isInScope(area, geographyScopes));
        const active =
          available.find(
            (area) => area.id === activeGeographyId || area.path === activeGeographyId,
          ) ??
          available.find((area) => area.id === "geo-in-madhya-pradesh") ??
          available[0];
        setAreas(available);
        setSelection((current) => ({ ...current, area: active?.id ?? "" }));
        if (!active) {
          setError("No approved model area is available for this account.");
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("The model areas could not be loaded.");
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeGeographyId, geographyScopes]);

  useEffect(() => {
    if (!selection.area) return;
    let cancelled = false;
    setIsLoading(true);
    setOptions(null);
    Promise.all([
      getPlanningOptions(selection.area, accessToken),
      refreshHistory(selection.area),
    ])
      .then(async ([nextOptions, items]) => {
        if (cancelled) return;
        setOptions(nextOptions);
        setSelection((current) => ({
          ...current,
          specificMonth:
            current.specificMonth ||
            nextOptions.next_three_months.planning_date.slice(0, 7),
        }));

        if (!restored.current) {
          restored.current = true;
          const latest =
            items.find(
              (item) => item.status === "queued" || item.status === "running",
            ) ??
            items.find((item) => item.status === "completed") ??
            items.find((item) => item.status === "waiting") ??
            items[0];
          if (latest) await openRun(latest);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Planning data could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, openRun, refreshHistory, selection.area]);

  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    let cancelled = false;
    let timeout: number | undefined;
    let failures = 0;

    const schedule = (delay: number) => {
      timeout = window.setTimeout(poll, delay + Math.random() * 500);
    };
    const poll = async () => {
      try {
        const next = await getPredictionRequest(run.request_id, accessToken);
        if (cancelled) return;
        failures = 0;
        setError(null);
        setRun(next);
        if (next.status === "completed" || next.status === "failed") {
          await refreshHistory(next.geography_id);
          return;
        }
      } catch (pollError) {
        if (!cancelled) {
          failures += 1;
          setError(
            pollError instanceof Error
              ? pollError.message
              : "The planning check status could not be loaded.",
          );
        }
      }
      if (!cancelled) {
        schedule(Math.min(30_000, 3_000 * 2 ** Math.min(failures, 3)));
      }
    };

    schedule(3_000);
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [accessToken, refreshHistory, run?.request_id, run?.status]);

  async function startPlan() {
    if (!options) return;
    const month = planningMonth(selection, options);
    if (!month) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await submitPrediction(accessToken, {
        geographyId: selection.area,
        planningMonth: month,
        target: targetForPeriod(selection.period),
        scenario:
          selection.period === "long-term" && selection.scenario
            ? selection.scenario
            : undefined,
        projectionPeriod: selection.period === "long-term" ? "2031-2040" : undefined,
      });
      const next =
        "request_status" in response
          ? requestFromResult(response, selection.area)
          : await getPredictionRequest(response.request_id, accessToken);
      setRun(next);
      setView("result");
      await refreshHistory(selection.area);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The planning check could not be started.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeSelection(next: PlanningSelection) {
    const changedArea = next.area !== selection.area;
    setSelection(next);
    setError(null);
    if (changedArea) {
      setRun(null);
      setHistory([]);
    }
  }

  return (
    <>
      <IconSprite />
      <AppShell
        nav={nav}
        activeNav={view === "users" ? "users" : "planning"}
        onNavigate={(id) => setView(id === "users" ? "users" : "planning")}
        onSignOut={onSignOut}
        userLabel={username}
      >
        {view === "users" ? (
          <UserManagement accessToken={accessToken} />
        ) : view === "planning" ? (
          <PlanningSetup
            selection={selection}
            areas={areas}
            options={options}
            isLoading={isLoading}
            isSubmitting={isSubmitting}
            error={error}
            onChange={changeSelection}
            onStart={startPlan}
          />
        ) : run ? (
          <PlanningResult
            selection={selection}
            areas={areas}
            options={options}
            run={run}
            history={history}
            error={error}
            onSelectRun={(summary) => void openRun(summary)}
            onNewPlan={() => setView("planning")}
          />
        ) : null}
      </AppShell>
    </>
  );
}

function isInScope(area: GeographyRecord, scopes: string[]) {
  if (scopes.length === 0) return false;
  return scopes.some(
    (scope) => area.path === scope || area.path.startsWith(`${scope}/`),
  );
}

function requestFromResult(
  result: PredictionResult,
  geographyId: string,
): PredictionRequest {
  return {
    request_id: result.request_id,
    status: "completed",
    stage: "completed",
    geography_id: geographyId,
    planning_date: result.planning_date,
    source_as_of: result.source_as_of,
    dagster_run_id: null,
    error_code: null,
    climate: result.climate,
    result,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    available_from: null,
    planning_target: result.planning_target,
    projection_scenario: result.projection_scenario,
    projection_period: result.projection_period,
  };
}
