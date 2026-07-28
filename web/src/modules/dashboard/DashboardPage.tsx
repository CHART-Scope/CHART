import type { CurrentUserContext } from "../auth/authClient";
import { canRunPredictions } from "../auth/userContext";
import { ErrorBanner } from "../ui/ErrorBanner";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import type { ChartRoute } from "../routes/types";
import { WorkspaceShell } from "../shell/WorkspaceShell";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { PredictionPipelineCard } from "./PredictionPipelineCard";
import { useDashboardGeographies } from "./useDashboardGeographies";

import "./Dashboard.css";

type DashboardPageProps = {
  accessToken?: string;
  onNavigate: (route: ChartRoute) => void;
  currentUser: CurrentUserContext;
  onSignOut: (returnTo?: string) => void;
};

export function DashboardPage({
  accessToken,
  onNavigate,
  currentUser,
  onSignOut,
}: DashboardPageProps) {
  const activeGeography =
    currentUser.activeGeographyId ?? currentUser.geographyScopes[0];
  const userCanRunPredictions = canRunPredictions(currentUser);

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
          label: geography.supportsPrediction
            ? geography.name
            : `${geography.name} — model not available`,
          disabled: !geography.supportsPrediction,
        }))
      : [{ value: "", label: "No configured geography" }];

  return (
    <WorkspaceShell
      activeRoute="dashboard"
      pageTitle="Heat planning"
      pageSubtitle="Create traceable low-birth-weight planning estimates from real climate data."
      currentUser={currentUser}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
    >
      {geographyError ? <ErrorBanner message={geographyError} /> : null}

      <DashboardFilterBar
        regionOptions={regionOptions}
        selectedRegion={selectedGeography?.id ?? ""}
        onRegionChange={setSelectedGeographyId}
      />

      <section className="dashboard-content-grid">
        <ErrorBoundary sectionName="prediction pipeline">
          <PredictionPipelineCard
            accessToken={accessToken}
            canRun={userCanRunPredictions}
            geography={selectedGeography}
          />
        </ErrorBoundary>
      </section>
    </WorkspaceShell>
  );
}
