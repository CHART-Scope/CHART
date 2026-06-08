"use client";

import { useEffect, useState, type ReactNode } from "react";

import { listGeographies, type GeographyRecord } from "../../lib/geographyClient";
import { getSetupStatus, resetSetup, type SetupStatus } from "../../lib/setupClient";
import {
  createUser,
  disableUser,
  listUsers,
  type ChartUserRecord,
} from "../../lib/userClient";
import type { ChartRole, CurrentUserContext } from "../auth/authClient";
import {
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

const defaultNewUserRole: ChartRole = "health_planning_lead";

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
    username: "",
    password: "",
    role: defaultNewUserRole,
    geographyId: "",
  });
  const [users, setUsers] = useState<ChartUserRecord[]>([]);
  const [geographies, setGeographies] = useState<GeographyRecord[]>([]);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const userCanManageUsers = canManageUsers(currentUser);

  useEffect(() => {
    getSetupStatus()
      .then(setSetupStatus)
      .catch(() => setSetupError("CHART setup status could not be loaded."));
  }, []);

  useEffect(() => {
    if (!userCanManageUsers) {
      return;
    }

    Promise.all([listUsers(accessToken), listGeographies()])
      .then(([userRows, geographyRows]) => {
        setUsers(userRows);
        setGeographies(geographyRows);
        setNewUser((draft) => ({
          ...draft,
          geographyId: draft.geographyId || geographyRows[0]?.id || "",
        }));
      })
      .catch((error) => {
        setUserError(
          error instanceof Error ? error.message : "CHART users could not be loaded.",
        );
      });
  }, [accessToken, userCanManageUsers]);

  async function addUser() {
    setUserError(null);
    setIsSavingUser(true);

    try {
      const createdUser = await createUser(
        {
          name: newUser.name,
          email: newUser.email,
          username: newUser.username,
          password: newUser.password,
          roles: [newUser.role],
          geographyIds: [newUser.geographyId],
        },
        accessToken,
      );

      setUsers((currentUsers) => [
        createdUser,
        ...currentUsers.filter((user) => user.userId !== createdUser.userId),
      ]);
      setNewUser({
        name: "",
        email: "",
        username: "",
        password: "",
        role: defaultNewUserRole,
        geographyId: geographies[0]?.id || "",
      });
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "CHART user could not be created.",
      );
    } finally {
      setIsSavingUser(false);
    }
  }

  async function disableManagedUser(userId: string) {
    setUserError(null);

    try {
      const disabledUser = await disableUser(userId, accessToken);

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.userId === disabledUser.userId ? disabledUser : user,
        ),
      );
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "CHART user could not be disabled.",
      );
    }
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
                <h2>Manage planning users</h2>
                <p>
                  Create Keycloak-backed CHART users and keep their local role and
                  geography records visible in setup.
                </p>
              </div>
              <span className="setup-admin-badge">First admin ready</span>
            </div>

            {userError ? (
              <div className="auth-error setup-error">{userError}</div>
            ) : null}

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
                Username
                <input
                  placeholder="health-lead"
                  value={newUser.username}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      username: event.target.value,
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
                Temporary password
                <input
                  placeholder="At least 8 characters"
                  type="password"
                  value={newUser.password}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      password: event.target.value,
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
                <select
                  value={newUser.geographyId}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      geographyId: event.target.value,
                    }))
                  }
                >
                  {geographies.map((geography) => (
                    <option key={geography.id} value={geography.id}>
                      {geography.name} ({geography.levelLabel})
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={isSavingUser || geographies.length === 0}
                onClick={addUser}
              >
                {isSavingUser ? "Creating user" : "Create user"}
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
              {users
                .filter((user) => user.userId !== currentUser.userId)
                .map((user) => {
                  const primaryGeography = user.geographyScopes[0];

                  return (
                    <UserRow
                      email={user.email ?? "Not provided"}
                      geography={primaryGeography?.path ?? ""}
                      key={user.userId}
                      name={user.displayName}
                      role={user.roles[0]}
                      status={user.status === "active" ? "Active" : "Disabled"}
                      action={
                        user.status === "active" ? (
                          <button
                            className="ghost-button compact-button"
                            type="button"
                            onClick={() => disableManagedUser(user.userId)}
                          >
                            Disable
                          </button>
                        ) : null
                      }
                    />
                  );
                })}
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
          <span className="section-kicker">Repository source</span>
          <h2>Public action repository</h2>
          <p>
            CHART reads published action records through the repository adapter. Setup
            imports the selected records into the workspace so planning has a stable
            local snapshot.
          </p>
          <div className="setup-action-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => onNavigate("solutions")}
            >
              View action repository
            </button>
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
                <span>Configured hazards</span>
                <strong>{setupStatus?.counts.hazards ?? 0}</strong>
              </div>
              <div className="setup-fact">
                <span>Repository actions</span>
                <strong>{setupStatus?.counts.workspaceSolutions ?? 0}</strong>
              </div>
            </div>
            {setupStatus?.solutionImport.message ? (
              <p>{setupStatus.solutionImport.message}</p>
            ) : null}
            {isResetConfirming ? (
              <div className="setup-reset-confirm">
                <strong>Reset setup and sign out?</strong>
                <p>
                  This clears the current workspace setup state and returns CHART to
                  first-run onboarding. The next setup will pull matching actions from
                  the repository again.
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
  action,
  email,
  geography,
  name,
  role,
  status,
}: {
  action?: ReactNode;
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
      {action}
    </div>
  );
}
