"use client";

import { useEffect, useState } from "react";

import { getSetupStatus } from "../../lib/setupClient";
import type { CurrentUserContext } from "../auth/authClient";
import { canManageContent } from "../auth/userContext";
import { DataCard } from "../ui/DataCard";
import { ErrorBanner } from "../ui/ErrorBanner";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import type { ChartRoute } from "../routes/types";
import { WorkspaceShell } from "../shell/WorkspaceShell";
import { CommunityConcernsCard } from "./CommunityConcernsCard";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { DashboardKpiRow } from "./DashboardKpiRow";
import { HealthResilienceCard } from "./HealthResilienceCard";
import { HighestRiskGroupsCard } from "./HighestRiskGroupsCard";
import { OpenStreetMapPanel } from "./OpenStreetMapPanel";
import { PendingActionsCard } from "./PendingActionsCard";
import { ProjectedTemperaturesCard } from "./ProjectedTemperaturesCard";
import { useDashboardGeographies } from "./useDashboardGeographies";

import "./Dashboard.css";

type DashboardPageProps = {
  onNavigate: (route: ChartRoute) => void;
  currentUser: CurrentUserContext;
  onSignOut: (returnTo?: string) => void;
};

export function DashboardPage({
  onNavigate,
  currentUser,
  onSignOut,
}: DashboardPageProps) {
  const [selectedHazards, setSelectedHazards] = useState<
    { id: string; label: string }[]
  >([]);
  const activeGeography =
    currentUser.activeGeographyId ?? currentUser.geographyScopes[0];
  const userCanManageContent = canManageContent(currentUser);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);

    getSetupStatus({ signal: controller.signal })
      .then((status) => {
        if (isMounted) {
          setSelectedHazards(status.selectedHazards);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSelectedHazards([]);
        }
      });

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const {
    visibleGeographies,
    selectedGeography,
    error: geographyError,
    setSelectedGeographyId,
  } = useDashboardGeographies({
    geographyScopes: currentUser.geographyScopes,
    activeGeography,
  });

  const regionOptions =
    visibleGeographies.length > 0
      ? visibleGeographies.map((geography) => ({
          value: geography.id,
          label: geography.name,
        }))
      : [{ value: "", label: "No configured geography" }];

  return (
    <WorkspaceShell
      activeRoute="dashboard"
      pageTitle="My dashboard"
      pageSubtitle="Live overview of climate-health risk in your focus region."
      currentUser={currentUser}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
    >
      {geographyError ? <ErrorBanner message={geographyError} /> : null}

      <DashboardFilterBar
        regionOptions={regionOptions}
        selectedRegion={selectedGeography?.id ?? ""}
        selectedHazards={selectedHazards}
        onRegionChange={setSelectedGeographyId}
      />

      <ErrorBoundary sectionName="KPI metrics">
        <DashboardKpiRow geographyId={selectedGeography?.id} />
      </ErrorBoundary>

      <section className="dashboard-content-grid">
        <ErrorBoundary sectionName="temperature projections">
          <ProjectedTemperaturesCard geographyId={selectedGeography?.id} />
        </ErrorBoundary>
        <ErrorBoundary sectionName="risk map">
          <DataCard
            eyebrow="Risk map"
            title={selectedGeography?.name ?? "No geography selected"}
            actions={
              userCanManageContent ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onNavigate("solutions")}
                >
                  Open action repository
                </button>
              ) : null
            }
          >
            <OpenStreetMapPanel selectedGeography={selectedGeography} />
          </DataCard>
        </ErrorBoundary>
        {/* <ErrorBoundary sectionName="risk groups">
          <HighestRiskGroupsCar
          d geographyId={selectedGeography?.id} />
        </ErrorBoundary>
        <ErrorBoundary sectionName="pending actions">
          <PendingActionsCard geographyId={selectedGeography?.id} />
        </ErrorBoundary> */}
      </section>

      {/* <section className="dashboard-lower-grid">
        <ErrorBoundary sectionName="health resilience">
          <HealthResilienceCard geographyId={selectedGeography?.id} />
        </ErrorBoundary>
        <ErrorBoundary sectionName="community concerns">
          <CommunityConcernsCard geographyId={selectedGeography?.id} />
        </ErrorBoundary>
      </section> */}
    </WorkspaceShell>
  );
}
