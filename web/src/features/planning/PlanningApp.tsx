"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import {
  listGeographies,
  listModelCatalog,
  type GeographyRecord,
  type ModelCatalogEntry,
} from "@/lib/planningClient";
import { rememberActiveGeography } from "@/lib/authClient";
import { PlanningSetup } from "./PlanningSetup";
import { defaultPlanningSelection, type PlanningSelection } from "./planningWireframe";

type Props = {
  username: string;
  roles: string[];
  geographyScopes: string[];
  activeGeographyId?: string;
  onSignOut: () => void;
};

export function PlanningApp({
  username,
  roles,
  geographyScopes,
  activeGeographyId,
  onSignOut,
}: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<PlanningSelection>(
    defaultPlanningSelection,
  );
  const [areas, setAreas] = useState<GeographyRecord[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = appNavForRoles(roles);

  useEffect(() => {
    let cancelled = false;
    listGeographies()
      .then((records) => {
        if (cancelled) return;
        const inScope = records.filter(
          (area) => area.supportsPrediction && isInScope(area, geographyScopes),
        );
        const active =
          inScope.find(
            (area) => area.id === activeGeographyId || area.path === activeGeographyId,
          ) ??
          inScope.find((area) => area.id === "geo-in-madhya-pradesh") ??
          inScope[0];
        setAreas(inScope);
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
  }, [activeGeographyId, geographyScopes]);

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
    if (!selection.area) return;
    setIsSubmitting(true);
    const query = selection.outcome
      ? `?outcome=${encodeURIComponent(selection.outcome)}`
      : "";
    router.push(`/dashboard/${encodeURIComponent(selection.area)}${query}`);
  }, [router, selection.area]);

  function changeSelection(next: PlanningSelection) {
    if (next.area !== selection.area) {
      const nextArea = areas.find((area) => area.id === next.area);
      if (nextArea) rememberActiveGeography(nextArea.path);
    }
    setSelection(next);
    setError(null);
  }

  return (
    <>
      <IconSprite />
      <AppShell
        nav={nav}
        activeNav="planning"
        onNavigate={(id) => {
          const target = NAV_ROUTE[id];
          if (target) router.push(target);
        }}
        onSignOut={onSignOut}
        userLabel={username}
      >
        <PlanningSetup
          selection={selection}
          areas={areas}
          catalog={catalog}
          isLoading={isLoading}
          isSubmitting={isSubmitting}
          error={error}
          onChange={changeSelection}
          onStart={openDashboard}
        />
      </AppShell>
    </>
  );
}

function isInScope(area: GeographyRecord, scopes: string[]) {
  if (scopes.length === 0) return false;
  const areaPath = normalizeScope(area.path);
  return scopes.some((raw) => {
    const scope = normalizeScope(raw);
    if (!scope) return false;
    if (scope === area.id) return true;
    if (scope === areaPath) return true;
    // A parent scope grants its descendants. A child scope must not pull its
    // ancestors into the picker, otherwise a sub-area user can navigate back
    // to a parent geography that was not selected during onboarding.
    return areaPath.startsWith(`${scope}/`);
  });
}

function normalizeScope(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") || !trimmed.includes("/") ? trimmed : `/${trimmed}`;
}
