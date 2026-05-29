"use client";

import { useState } from "react";

import { useChartContent } from "../../app/ChartContentProvider";
import type { CurrentUserContext } from "../auth/authClient";
import { WorkspaceShell } from "../shell/WorkspaceShell";
import { OpenStreetMapPanel } from "./OpenStreetMapPanel";

type DashboardPageProps = {
  onNavigate: (route: "landing" | "dashboard" | "cms") => void;
  currentUser: CurrentUserContext;
  onSignOut: () => void;
};

type MapLayer = "heat" | "flood" | "population" | "composite";

function collaboratorStack(collaborators: string[]) {
  return (
    <div className="collaborator-stack">
      {collaborators.slice(0, 4).map((initial, index) => (
        <span
          className={`mini-avatar avatar-${(index % 6) + 1}`}
          key={`${initial}-${index}`}
        >
          {initial}
        </span>
      ))}
    </div>
  );
}

export function DashboardPage({
  onNavigate,
  currentUser,
  onSignOut,
}: DashboardPageProps) {
  const {
    dashboardActions,
    dashboardBoundary,
    dashboardFilters,
    dashboardHealthPosts,
    dashboardMetrics,
    dashboardPlans,
    dashboardZones,
  } = useChartContent();
  const [mapLayer, setMapLayer] = useState<MapLayer>("heat");
  const [selectedZoneId, setSelectedZoneId] = useState(dashboardZones[0].id);

  const selectedZone =
    dashboardZones.find((zone) => zone.id === selectedZoneId) ?? dashboardZones[0];

  return (
    <WorkspaceShell
      activeRoute="dashboard"
      pageTitle="Planning workspace"
      crumb="CHART Toolkit / Shared dashboard"
      onNavigate={onNavigate}
    >
      <section className="page-header-block">
        <div>
          <div className="page-breadcrumb">Workspace / Risk overview</div>
          <h1 className="page-heading">District climate-health dashboard</h1>
          <p className="page-copy">
            Shared geography context for U1 and U2. Review indicators, inspect priority
            zones and move into planning with the same evidence base.
          </p>
        </div>

        <div className="filter-row">
          <div className="signed-in-pill">
            <span>{currentUser.username}</span>
            <small>
              {currentUser.roles[0]?.replaceAll("_", " ") ?? "CHART user"} ·{" "}
              {currentUser.activeGeographyId ?? currentUser.geographyScopes[0]}
            </small>
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
          <label className="filter-pill">
            Geography
            <select defaultValue={dashboardFilters.geographyOptions[0]}>
              {dashboardFilters.geographyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-pill">
            Planning cycle
            <select defaultValue={dashboardFilters.yearOptions[0]}>
              {dashboardFilters.yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-pill">
            Map layer
            <select
              value={mapLayer}
              onChange={(event) => setMapLayer(event.target.value as MapLayer)}
            >
              {dashboardFilters.hazardOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "population"
                    ? "Population"
                    : option === "composite"
                      ? "Composite risk"
                      : `${option[0].toUpperCase()}${option.slice(1)} risk`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="metric-grid">
        {dashboardMetrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span className="metric-card-label">{metric.label}</span>
            <strong className="metric-card-value">{metric.value}</strong>
            <span className="metric-card-detail">{metric.detail}</span>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel-card panel-span-two">
          <div className="panel-head">
            <div>
              <span className="panel-eyebrow">OpenStreetMap</span>
              <h2>Priority risk map</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => onNavigate("cms")}
            >
              Open content studio
            </button>
          </div>
          <OpenStreetMapPanel
            boundary={dashboardBoundary}
            healthPosts={dashboardHealthPosts}
            layer={mapLayer}
            onSelectZone={setSelectedZoneId}
            selectedZoneId={selectedZoneId}
            zones={dashboardZones}
          />
        </article>

        <aside className="panel-card zone-detail-card">
          <div className="panel-head">
            <div>
              <span className="panel-eyebrow">Selected zone</span>
              <h2>{selectedZone.name}</h2>
            </div>
          </div>
          <p className="zone-subtitle">
            {selectedZone.subtitle} · Population{" "}
            {Math.round(selectedZone.population / 1000)}k
          </p>
          <div className="dimension-list">
            <div className="dimension-row">
              <span>Heat</span>
              <div className="dimension-bar">
                <div
                  className="dimension-fill heat"
                  style={{ width: `${selectedZone.heat}%` }}
                />
              </div>
              <b>{selectedZone.heat}</b>
            </div>
            <div className="dimension-row">
              <span>Flood</span>
              <div className="dimension-bar">
                <div
                  className="dimension-fill flood"
                  style={{ width: `${selectedZone.flood}%` }}
                />
              </div>
              <b>{selectedZone.flood}</b>
            </div>
            <div className="dimension-row">
              <span>MNCH</span>
              <div className="dimension-bar">
                <div
                  className="dimension-fill mnch"
                  style={{ width: `${selectedZone.mnch}%` }}
                />
              </div>
              <b>{selectedZone.mnch}</b>
            </div>
            <div className="dimension-row">
              <span>Water</span>
              <div className="dimension-bar">
                <div
                  className="dimension-fill water"
                  style={{ width: `${selectedZone.water}%` }}
                />
              </div>
              <b>{selectedZone.water}</b>
            </div>
          </div>
          <div className="risk-callout">
            {selectedZone.level === "crit"
              ? "Critical composite risk — this zone should stay in the first funding case."
              : "Elevated risk — keep this zone in the collaborative review set."}
          </div>
        </aside>
      </section>

      <section className="dashboard-grid secondary-grid">
        <article className="panel-card">
          <div className="panel-head">
            <div>
              <span className="panel-eyebrow">Pending coordination</span>
              <h2>Next actions</h2>
            </div>
          </div>
          <div className="action-list">
            {dashboardActions.map((action) => (
              <div className="action-item" key={action.title}>
                <div>
                  <strong>{action.title}</strong>
                  <span>{action.owner}</span>
                </div>
                <span className={`status-chip ${action.status}`}>
                  {action.status.replace("-", " ")}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card panel-span-two">
          <div className="panel-head">
            <div>
              <span className="panel-eyebrow">Plans</span>
              <h2>Recent planning cycles</h2>
            </div>
          </div>
          <div className="plan-table">
            <div className="plan-table-head">
              <span>Name</span>
              <span>Date created</span>
              <span>Last edited</span>
              <span>Status</span>
              <span>Collaborators</span>
            </div>
            {dashboardPlans.map((plan) => (
              <div className="plan-table-row" key={plan.name}>
                <div className="plan-table-name">{plan.name}</div>
                <span>{plan.created}</span>
                <span>{plan.edited}</span>
                <span
                  className={`status-chip ${
                    plan.status === "Active" ? "active" : "closed"
                  }`}
                >
                  {plan.status}
                </span>
                {collaboratorStack(plan.collaborators)}
              </div>
            ))}
          </div>
        </article>
      </section>
    </WorkspaceShell>
  );
}
