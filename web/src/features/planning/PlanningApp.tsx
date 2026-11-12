"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { rememberActiveGeography } from "@/lib/authClient";
import { useGeographies } from "@/lib/useGeographies";
import { useModelCatalog } from "@/lib/useModelCatalog";
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

export const savedPlansQueryKey = ["saved-plans"] as const;

type Props = {
  geographyScopes: string[];
  activeGeographyId?: string;
};

export function PlanningApp({ geographyScopes, activeGeographyId }: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<PlanningSelection>(
    defaultPlanningSelection,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // Saved plans, places and catalogs all come from the shared query cache, so
  // returning to the Planning center draws at once instead of re-reading them.
  const plansQuery = useQuery({
    queryKey: savedPlansQueryKey,
    queryFn: ({ signal }) => listSavedPlans(signal),
    staleTime: 0,
  });
  const removePlan = useCallback(
    async (planId: string) => {
      await deleteSavedPlan(planId);
      queryClient.setQueryData<SavedPlan[]>(savedPlansQueryKey, (current) =>
        current?.filter((plan) => plan.id !== planId),
      );
    },
    [queryClient],
  );

  // A stable key rather than the array: a parent re-render hands over an
  // equal but new array, and depending on its identity reset the selection.
  const scopesKey = geographyScopes.join("|");
  const { geographies, error: placesError } = useGeographies();
  const allGeographies = useMemo(() => geographies ?? [], [geographies]);
  const areas = useMemo(() => {
    const scopes = scopesKey ? scopesKey.split("|") : [];
    return allGeographies.filter((area) => isInScope(area, scopes));
  }, [allGeographies, scopesKey]);
  const defaultArea = useMemo(() => {
    if (!geographies) return null;
    const scopes = scopesKey ? scopesKey.split("|") : [];
    // Plan from the family the user last chose, at its broadest useful
    // level (Kenya, Madhya Pradesh), not from the first county or division.
    return defaultPlanningArea(geographies, scopes, activeGeographyId) ?? null;
  }, [geographies, scopesKey, activeGeographyId]);

  useEffect(() => {
    if (!geographies) return;
    setSelection((current) => ({ ...current, area: defaultArea?.id ?? "" }));
  }, [geographies, defaultArea]);

  const { catalog: loadedCatalog } = useModelCatalog(selection.area || null);
  const catalog = loadedCatalog ?? [];
  const isLoading = geographies === null && !placesError;
  const error = placesError
    ? "The model areas could not be loaded."
    : geographies && !defaultArea
      ? geographyScopes.length === 0
        ? "This account has no geography assigned yet."
        : "No area matched your geography scope."
      : null;

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
          plans={plansQuery.data ?? null}
          error={plansQuery.error?.message ?? null}
          onRetry={() => void plansQuery.refetch()}
          onRemove={removePlan}
        />
      }
    />
  );
}
