"use client";

import { useEffect, useMemo, useState } from "react";

import { listGeographies, type GeographyRecord } from "../../lib/geographyClient";
import type { CurrentUserContext } from "../auth/authClient";
import {
  canManageContent,
  formatGeographyLevel,
  formatGeographyPath,
  formatRole,
  getUserProfile,
} from "../auth/userContext";
import type { ChartRoute } from "../routes/types";
import { WorkspaceShell } from "../shell/WorkspaceShell";
import { OpenStreetMapPanel } from "./OpenStreetMapPanel";

type DashboardPageProps = {
  onNavigate: (route: ChartRoute) => void;
  currentUser: CurrentUserContext;
  onSignOut: (returnTo?: string) => void;
};

function isInUserScope(geography: GeographyRecord, scopes: string[]) {
  if (scopes.length === 0) {
    return true;
  }

  return scopes.some((scope) => {
    return (
      geography.path === scope ||
      geography.path.startsWith(`${scope}/`) ||
      scope.startsWith(`${geography.path}/`)
    );
  });
}

function sortGeographies(geographies: GeographyRecord[]) {
  return [...geographies].sort((first, second) => {
    if (first.countryCode !== second.countryCode) {
      return first.countryCode.localeCompare(second.countryCode);
    }

    if (first.level !== second.level) {
      return first.level.localeCompare(second.level);
    }

    return first.name.localeCompare(second.name);
  });
}

function getInitialSelectedGeography(
  geographies: GeographyRecord[],
  activeGeography: string | undefined,
) {
  return (
    geographies.find((geography) => geography.path === activeGeography) ??
    geographies.find((geography) => geography.id === activeGeography) ??
    geographies[0]
  );
}

export function DashboardPage({
  onNavigate,
  currentUser,
  onSignOut,
}: DashboardPageProps) {
  const [geographies, setGeographies] = useState<GeographyRecord[]>([]);
  const [selectedGeographyId, setSelectedGeographyId] = useState("");
  const [geographyError, setGeographyError] = useState<string | null>(null);
  const [isLoadingGeographies, setIsLoadingGeographies] = useState(true);
  const userProfile = getUserProfile(currentUser);
  const activeGeography =
    currentUser.activeGeographyId ?? currentUser.geographyScopes[0];
  const userCanManageContent = canManageContent(currentUser);
  const visibleGeographies = useMemo(
    () =>
      sortGeographies(
        geographies.filter((geography) =>
          isInUserScope(geography, currentUser.geographyScopes),
        ),
      ),
    [currentUser.geographyScopes, geographies],
  );
  const selectedGeography = visibleGeographies.find(
    (geography) => geography.id === selectedGeographyId,
  );

  useEffect(() => {
    let isMounted = true;

    async function loadGeographies() {
      try {
        const records = await listGeographies();

        if (!isMounted) {
          return;
        }

        setGeographies(records);
        setGeographyError(null);

        const firstSelected = getInitialSelectedGeography(records, activeGeography);
        setSelectedGeographyId(firstSelected?.id ?? "");
      } catch {
        if (isMounted) {
          setGeographyError("CHART geography records could not be loaded.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingGeographies(false);
        }
      }
    }

    void loadGeographies();

    return () => {
      isMounted = false;
    };
  }, [activeGeography]);

  useEffect(() => {
    if (visibleGeographies.length === 0) {
      setSelectedGeographyId("");
      return;
    }

    if (
      selectedGeographyId &&
      visibleGeographies.some((geography) => geography.id === selectedGeographyId)
    ) {
      return;
    }

    const firstSelected = getInitialSelectedGeography(
      visibleGeographies,
      activeGeography,
    );
    setSelectedGeographyId(firstSelected?.id ?? "");
  }, [activeGeography, selectedGeographyId, visibleGeographies]);

  return (
    <WorkspaceShell
      activeRoute="dashboard"
      pageTitle="Geography map"
      crumb="CHART Toolkit / Geography"
      currentUser={currentUser}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
    >
      <section className="page-header-block">
        <div>
          <div className="page-breadcrumb">Signed-in geography</div>
          <h1 className="page-heading">Geography workspace</h1>
          <p className="page-copy">
            CHART is showing configured geography records from the app database. Risk
            layers will appear here only after real climate, health, facility, or
            boundary data is connected.
          </p>
        </div>

        <div className="filter-row">
          <div className="signed-in-pill">
            <span>{currentUser.username}</span>
            <small>
              {formatRole(currentUser.roles[0])} ·{" "}
              {formatGeographyPath(activeGeography)}
            </small>
          </div>
          <label className="filter-pill">
            Active scope
            <select value={activeGeography ?? ""} disabled>
              {(currentUser.geographyScopes.length > 0
                ? currentUser.geographyScopes
                : [activeGeography ?? ""]
              )
                .filter(Boolean)
                .map((scope) => (
                  <option key={scope} value={scope}>
                    {formatGeographyPath(scope)}
                  </option>
                ))}
            </select>
          </label>
          <div className="filter-pill readonly-filter">
            Level
            <strong>{formatGeographyLevel(currentUser.geographyLevel)}</strong>
          </div>
          <label className="filter-pill">
            Map location
            <select
              value={selectedGeography?.id ?? ""}
              disabled={visibleGeographies.length === 0}
              onChange={(event) => setSelectedGeographyId(event.target.value)}
            >
              {visibleGeographies.length > 0 ? (
                visibleGeographies.map((geography) => (
                  <option key={geography.id} value={geography.id}>
                    {geography.name}
                  </option>
                ))
              ) : (
                <option value="">No configured geography</option>
              )}
            </select>
          </label>
        </div>
      </section>

      {geographyError ? (
        <div className="auth-error setup-error">{geographyError}</div>
      ) : null}

      <section className="dashboard-map-facts">
        <article className="map-fact-card">
          <span>Configured geographies</span>
          <strong>{isLoadingGeographies ? "..." : visibleGeographies.length}</strong>
          <small>Loaded from CHART Postgres</small>
        </article>
        <article className="map-fact-card">
          <span>Selected geography</span>
          <strong>{selectedGeography?.name ?? "Not set"}</strong>
          <small>{selectedGeography?.levelLabel ?? "No geography selected"}</small>
        </article>
        <article className="map-fact-card">
          <span>Country code</span>
          <strong>{selectedGeography?.countryCode ?? "Not set"}</strong>
          <small>Stored geography metadata</small>
        </article>
        <article className="map-fact-card">
          <span>Risk layers</span>
          <strong>Not connected</strong>
          <small>No climate-health risk records loaded yet</small>
        </article>
      </section>

      <section className="dashboard-map-layout">
        <article className="panel-card dashboard-map-card">
          <div className="panel-head">
            <div>
              <span className="panel-eyebrow">OpenStreetMap</span>
              <h2>{selectedGeography?.name ?? "No geography selected"}</h2>
            </div>
            {userCanManageContent ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => onNavigate("solutions")}
              >
                Open action repository
              </button>
            ) : null}
          </div>
          <OpenStreetMapPanel selectedGeography={selectedGeography} />
        </article>

        <aside className="panel-card location-detail-card">
          <div className="panel-head">
            <div>
              <span className="panel-eyebrow">Selected geography</span>
              <h2>{selectedGeography?.name ?? "No geography loaded"}</h2>
            </div>
          </div>

          {selectedGeography ? (
            <>
              <div className="setup-fact-grid">
                <div className="setup-fact">
                  <span>Path</span>
                  <strong>{selectedGeography.path}</strong>
                </div>
                <div className="setup-fact">
                  <span>Level</span>
                  <strong>{selectedGeography.levelLabel}</strong>
                </div>
                <div className="setup-fact">
                  <span>Country</span>
                  <strong>{selectedGeography.countryCode}</strong>
                </div>
                <div className="setup-fact">
                  <span>External code</span>
                  <strong>{selectedGeography.externalCode ?? "Not set"}</strong>
                </div>
              </div>

              <div className="risk-callout">
                No climate-health risk layer is connected for this geography yet.
              </div>
            </>
          ) : (
            <div className="empty-panel">
              <h2>No geography records available</h2>
              <p>
                Complete onboarding or load geography reference data before using the
                dashboard map.
              </p>
            </div>
          )}

          <div className="location-list">
            <div className="location-list-heading">Configured geography records</div>
            {visibleGeographies.length > 0 ? (
              visibleGeographies.map((geography) => (
                <button
                  className={`location-row ${
                    geography.id === selectedGeography?.id ? "selected" : ""
                  }`}
                  key={geography.id}
                  type="button"
                  onClick={() => setSelectedGeographyId(geography.id)}
                >
                  <span>
                    <strong>{geography.name}</strong>
                    <small>{geography.path}</small>
                  </span>
                  <b>{geography.levelLabel}</b>
                </button>
              ))
            ) : (
              <p className="page-copy">No geography records are in scope.</p>
            )}
          </div>
        </aside>
      </section>

      <section className="dashboard-context-grid">
        <article className="panel-card">
          <div className="panel-head">
            <div>
              <span className="panel-eyebrow">Role context</span>
              <h2>{formatRole(currentUser.roles[0])}</h2>
            </div>
          </div>
          <p className="page-copy">{userProfile.setupFocus}</p>
        </article>

        <article className="panel-card">
          <span className="panel-eyebrow">Data needed next</span>
          <h2>Real dashboard layers</h2>
          <p className="page-copy">
            To show risk values here, CHART needs real boundary geometry, hazard scores,
            population or facility data, and source metadata linked to the selected
            geography.
          </p>
          <div className="setup-token-list">
            <span>Boundary geometry</span>
            <span>Climate-health risk layer</span>
            <span>Population or facility layer</span>
          </div>
        </article>
      </section>
    </WorkspaceShell>
  );
}
