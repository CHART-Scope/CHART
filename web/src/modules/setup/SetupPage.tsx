"use client";

import { useEffect, useState } from "react";

import { getSetupStatus, resetSetup, type SetupStatus } from "../../lib/setupClient";
import type { ChartRole, CurrentUserContext } from "../auth/authClient";
import {
  canManageContent,
  canManageUsers,
  formatGeographyLevel,
  formatGeographyPath,
  formatRole,
  getUserProfile,
  setupRoleOptions,
} from "../auth/userContext";
import type { ChartRoute } from "../routes/types";
import { WorkspaceShell } from "../shell/WorkspaceShell";

type SetupPageProps = {
  currentUser: CurrentUserContext;
  accessToken?: string;
  onNavigate: (route: ChartRoute) => void;
  onSignOut: (returnTo?: string) => void;
};

type PlannedUser = {
  id: string;
  name: string;
  email: string;
  role: ChartRole;
  geography: string;
};

const defaultNewUserRole: ChartRole = "u1_health_lead";

export function SetupPage({
  currentUser,
  accessToken,
  onNavigate,
  onSignOut,
}: SetupPageProps) {
  const profile = getUserProfile(currentUser);
  const activeGeography =
    currentUser.activeGeographyId ?? currentUser.geographyScopes[0] ?? "";
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: defaultNewUserRole,
    geography: activeGeography,
  });
  const [plannedUsers, setPlannedUsers] = useState<PlannedUser[]>([]);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const userCanManageUsers = canManageUsers(currentUser);
  const userCanManageContent = canManageContent(currentUser);

  useEffect(() => {
    getSetupStatus()
      .then(setSetupStatus)
      .catch(() => setSetupError("CHART setup status could not be loaded."));
  }, []);

  function addPlannedUser() {
    if (!newUser.name.trim() || !newUser.email.trim()) {
      return;
    }

    setPlannedUsers((currentUsers) => [
      ...currentUsers,
      {
        id: `${newUser.email}-${currentUsers.length}`,
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        role: newUser.role,
        geography: newUser.geography.trim() || activeGeography,
      },
    ]);
    setNewUser({
      name: "",
      email: "",
      role: defaultNewUserRole,
      geography: activeGeography,
    });
  }

  async function restartOnboarding() {
    setSetupError(null);
    setIsResetting(true);

    try {
      await resetSetup(accessToken);
      onSignOut("/onboarding");
    } catch (error) {
      setSetupError(
        error instanceof Error ? error.message : "CHART onboarding could not be reset.",
      );
      setIsResetting(false);
    }
  }

  return (
    <WorkspaceShell
      activeRoute="setup"
      crumb="CHART Toolkit / Profile & setup"
      currentUser={currentUser}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      pageTitle="Profile & setup"
    >
      <section className="page-header-block">
        <div>
          <div className="page-breadcrumb">Signed-in context</div>
          <h1 className="page-heading">{profile.roleLabel}</h1>
          <p className="page-copy">{profile.setupFocus}</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => onNavigate("dashboard")}
        >
          Open workspace
        </button>
      </section>

      {setupError ? <div className="auth-error setup-error">{setupError}</div> : null}

      <section className="setup-grid">
        <article className="panel-card setup-card setup-card-primary">
          <span className="section-kicker">Current access</span>
          <h2>{currentUser.username}</h2>
          <p>
            CHART reads this profile after sign-in and uses it to open the correct
            workspace, geography, and content controls.
          </p>

          <div className="setup-fact-grid">
            <div className="setup-fact">
              <span>Role</span>
              <strong>{formatRole(currentUser.roles[0])}</strong>
            </div>
            <div className="setup-fact">
              <span>Active geography</span>
              <strong>{formatGeographyPath(activeGeography)}</strong>
            </div>
            <div className="setup-fact">
              <span>Geography level</span>
              <strong>{formatGeographyLevel(currentUser.geographyLevel)}</strong>
            </div>
            <div className="setup-fact">
              <span>Email</span>
              <strong>{currentUser.email ?? "Not provided"}</strong>
            </div>
          </div>
        </article>

        <article className="panel-card setup-card">
          <span className="section-kicker">What this user can do</span>
          <div className="setup-list">
            {profile.capabilities.map((capability) => (
              <div className="setup-list-item" key={capability}>
                <span />
                <p>{capability}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card setup-card">
          <span className="section-kicker">Next actions</span>
          <div className="setup-step-list">
            {profile.nextActions.map((action, index) => (
              <SetupStep key={action} text={action} title={`Action ${index + 1}`} />
            ))}
          </div>
        </article>

        <article className="panel-card setup-card">
          <span className="section-kicker">Geography scope</span>
          <h2>Allowed areas</h2>
          <div className="setup-token-list">
            {currentUser.geographyScopes.length > 0 ? (
              currentUser.geographyScopes.map((scope) => (
                <span key={scope}>{formatGeographyPath(scope)}</span>
              ))
            ) : (
              <span>No geography scope assigned</span>
            )}
          </div>
        </article>

        {userCanManageUsers ? (
          <article className="panel-card setup-card setup-card-primary">
            <span className="section-kicker">User access setup</span>
            <div className="setup-card-heading-row">
              <div>
                <h2>Add planning users</h2>
                <p>
                  The first administrator can prepare U1, U2, U3, U4, and content users
                  for the selected geography scope.
                </p>
              </div>
              <span className="setup-admin-badge">First admin ready</span>
            </div>

            <div className="user-setup-form">
              <label>
                Name
                <input
                  placeholder="User name"
                  value={newUser.name}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Email
                <input
                  placeholder="name@example.org"
                  type="email"
                  value={newUser.email}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Role
                <select
                  value={newUser.role}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      role: event.target.value as ChartRole,
                    }))
                  }
                >
                  {setupRoleOptions.map((roleOption) => (
                    <option key={roleOption.role} value={roleOption.role}>
                      {roleOption.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Geography scope
                <input
                  placeholder={activeGeography || "/country/region"}
                  value={newUser.geography}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      geography: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="primary-button" type="button" onClick={addPlannedUser}>
                Add user
              </button>
            </div>

            <div className="user-setup-list">
              <UserRow
                email={currentUser.email ?? "Not provided"}
                geography={activeGeography}
                name={currentUser.username}
                role={currentUser.roles[0]}
                status="Signed in admin"
              />
              {plannedUsers.map((user) => (
                <UserRow
                  email={user.email}
                  geography={user.geography}
                  key={user.id}
                  name={user.name}
                  role={user.role}
                  status="Ready to invite"
                />
              ))}
            </div>
          </article>
        ) : null}

        <article className="panel-card setup-card">
          <span className="section-kicker">Role model</span>
          <h2>Required team roles</h2>
          <div className="role-template-list">
            {setupRoleOptions.map((roleOption) => (
              <div className="role-template-row" key={roleOption.role}>
                <strong>{roleOption.label}</strong>
                <span>{roleOption.responsibility}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card setup-card">
          <span className="section-kicker">Content controls</span>
          <h2>
            {userCanManageContent
              ? "Content studio available"
              : "Public repository access"}
          </h2>
          <p>
            {userCanManageContent
              ? "This user can edit and publish public action repository records."
              : "This user can browse the public action repository but cannot edit published records."}
          </p>
          <div className="setup-action-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => onNavigate("solutions")}
            >
              View action repository
            </button>
            {userCanManageContent ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => onNavigate("cms")}
              >
                Open content studio
              </button>
            ) : null}
          </div>
        </article>

        {userCanManageUsers ? (
          <article className="panel-card setup-card">
            <span className="section-kicker">Onboarding</span>
            <h2>{setupStatus?.completed ? "Setup complete" : "Setup required"}</h2>
            <p>
              Restart onboarding when the deployment country, hazards, or first
              workspace setup needs to be configured again.
            </p>
            <div className="setup-fact-grid">
              <div className="setup-fact">
                <span>Country</span>
                <strong>{setupStatus?.countryName ?? "Not set"}</strong>
              </div>
              <div className="setup-fact">
                <span>Repository actions</span>
                <strong>{setupStatus?.counts.repositoryItems ?? 0}</strong>
              </div>
            </div>
            {isResetConfirming ? (
              <div className="setup-reset-confirm">
                <strong>Reset setup and sign out?</strong>
                <p>
                  This clears the current workspace setup state and returns CHART to
                  first-run onboarding. The public action repository seed data stays
                  available.
                </p>
                <div className="setup-action-row">
                  <button
                    className="danger-button"
                    disabled={isResetting}
                    type="button"
                    onClick={restartOnboarding}
                  >
                    {isResetting ? "Resetting" : "Confirm reset"}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={isResetting}
                    type="button"
                    onClick={() => setIsResetConfirming(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="ghost-button"
                type="button"
                onClick={() => setIsResetConfirming(true)}
                disabled={isResetting}
              >
                Reset onboarding
              </button>
            )}
          </article>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}

function SetupStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="setup-step">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function UserRow({
  email,
  geography,
  name,
  role,
  status,
}: {
  email: string;
  geography: string;
  name: string;
  role: ChartRole | undefined;
  status: string;
}) {
  return (
    <div className="user-setup-row">
      <div>
        <strong>{name}</strong>
        <span>{email}</span>
      </div>
      <span>{formatRole(role)}</span>
      <span>{formatGeographyPath(geography)}</span>
      <b>{status}</b>
    </div>
  );
}
