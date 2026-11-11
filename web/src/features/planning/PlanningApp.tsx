"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  listGeographies,
  listModelCatalog,
  type GeographyRecord,
  type ModelCatalogEntry,
} from "@/lib/planningClient";
import { rememberActiveGeography } from "@/lib/authClient";
import {
  deleteSavedPlan,
  listSavedPlans,
  type SavedPlan,
} from "@/lib/savedPlansClient";
import { isInScope } from "@/lib/geographyScope";
import { dashboardHref } from "@/features/dashboard/dashboardNavigation";
import { dashboardTarget, defaultPlanningArea } from "./contextFamilies";
import { PlanningSetup } from "./PlanningSetup";
import { SavedPlansList } from "./SavedPlansList";
import { defaultPlanningSelection, type PlanningSelection } from "./planningWireframe";

type Props = {
  geographyScopes: string[];
  activeGeographyId?: string;
};

export function PlanningApp({ geographyScopes, activeGeographyId }: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<PlanningSelection>(
    defaultPlanningSelection,
  );
  const [areas, setAreas] = useState<GeographyRecord[]>([]);
  const [allGeographies, setAllGeographies] = useState<GeographyRecord[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansLoad, setPlansLoad] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setPlansError(null);
    listSavedPlans(controller.signal)
      .then(setPlans)
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setPlansError(failure.message);
      });
    return () => controller.abort();
  }, [plansLoad]);

  const removePlan = useCallback(async (planId: string) => {
    await deleteSavedPlan(planId);
    setPlans((current) => current?.filter((plan) => plan.id !== planId) ?? null);
  }, []);
  // A stable key rather than the array: a parent re-render (a token refresh
  // used to cause one) hands over an equal but new array, and depending on
  // its identity reloaded the areas and reset the user's selection.
  const scopesKey = geographyScopes.join("|");

  useEffect(() => {
    let cancelled = false;
    const geographyScopes = scopesKey ? scopesKey.split("|") : [];
    listGeographies()
      .then((records) => {
        if (cancelled) return;
        const inScope = records.filter((area) => isInScope(area, geographyScopes));
        // Plan from the family the user last chose, at its broadest useful
        // level (Kenya, Madhya Pradesh), not from the first county or division.
        const active = defaultPlanningArea(records, geographyScopes, activeGeographyId);
        setAreas(inScope);
        setAllGeographies(records);
        setSelection((current) => ({ ...current, area: active?.id ?? "" }));
        if (!active) {
          setError(
            geographyScopes.length === 0
              ? "This account has no geography assigned yet."
              : "No area matched your geography scope.",
          );
        }
        setIsLoading(false);
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
  }, [activeGeographyId, scopesKey]);

  useEffect(() => {
    let cancelled = false;
    if (!selection.area) {
      setCatalog([]);
      return;
    }
    listModelCatalog(selection.area, { includeDescendants: true })
      .then((items) => {
        if (!cancelled) setCatalog(items);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selection.area]);

  const openDashboard = useCallback(() => {
    const area = allGeographies.find((geo) => geo.id === selection.area);
    if (!area) return;
    setIsSubmitting(true);
    router.push(
      dashboardHref({
        ...dashboardTarget(area, allGeographies, geographyScopes),
        outcome: selection.outcome,
        choices: {},
      }),
    );
  }, [allGeographies, geographyScopes, router, selection.area, selection.outcome]);

  function changeSelection(next: PlanningSelection) {
    if (next.area !== selection.area) {
      const nextArea = areas.find((area) => area.id === next.area);
      if (nextArea) rememberActiveGeography(nextArea.path);
    }
    setSelection(next);
    setError(null);
  }

  return (
    <PlanningSetup
      selection={selection}
      areas={areas}
      catalog={catalog}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      error={error}
      onChange={changeSelection}
      onStart={openDashboard}
      savedPlans={
        <SavedPlansList
          plans={plans}
          error={plansError}
          onRetry={() => setPlansLoad((value) => value + 1)}
          onRemove={removePlan}
        />
      }
    />
  );
}
