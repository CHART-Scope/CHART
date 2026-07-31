"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell, type NavItem } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import {
  listGeographies,
  type GeographyRecord,
} from "@/lib/planningClient";
import { PlanningSetup } from "./PlanningSetup";
import {
  defaultPlanningSelection,
  type PlanningSelection,
} from "./planningWireframe";
import { UserManagement } from "./UserManagement";

type View = "planning" | "users";

const planningNav: NavItem = {
  id: "planning",
  label: "Planning center",
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
  const router = useRouter();
  const [view, setView] = useState<View>("planning");
  const [selection, setSelection] = useState<PlanningSelection>(
    defaultPlanningSelection,
  );
  const [areas, setAreas] = useState<GeographyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav: NavItem[] = roles.includes("chart_admin")
    ? [planningNav, { id: "users", label: "People & access", icon: "settings" }]
    : [planningNav];

  useEffect(() => {
    let cancelled = false;
    listGeographies()
      .then((records) => {
        if (cancelled) return;
        // Don't filter by supportsPrediction: the dashboard renders an
        // empty-state skeleton when nothing has been materialized yet,
        // and the onboarded location may not yet have a registered
        // model release. Geography scope from Keycloak still applies.
        const inScope = records.filter((area) =>
          isInScope(area, geographyScopes),
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

  const openDashboard = useCallback(() => {
    if (!selection.area) return;
    setIsSubmitting(true);
    router.push(`/dashboard/${encodeURIComponent(selection.area)}`);
  }, [router, selection.area]);

  function changeSelection(next: PlanningSelection) {
    setSelection(next);
    setError(null);
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
        ) : (
          <PlanningSetup
            selection={selection}
            areas={areas}
            isLoading={isLoading}
            isSubmitting={isSubmitting}
            error={error}
            onChange={changeSelection}
            onStart={openDashboard}
          />
        )}
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
