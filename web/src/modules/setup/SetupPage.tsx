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
  formatGeographyPath,
  formatRole,
  getUserProfile,
  setupRoleOptions,
} from "../auth/userContext";
import type { ChartRoute } from "../routes/types";
import { WorkspaceShell } from "../shell/WorkspaceShell";
import { DataCard } from "../ui/DataCard";
import { ErrorBanner } from "../ui/ErrorBanner";

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
    phone: "",
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
          phone: newUser.phone || undefined,
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
        phone: "",
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
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => onNavigate("dashboard")}
        >
          Open workspace
        </button>
      </section>

      {setupError ? <ErrorBanner message={setupError} /> : null}

      <section className="setup-grid">
        <DataCard eyebrow="Profile" title={currentUser.username}>
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
              <span>Email</span>
              <strong>{currentUser.email ?? "Not provided"}</strong>
            </div>
          </div>
          <div className="setup-scope-divider" />
          <div className="setup-scope-pills">
            {currentUser.geographyScopes.length > 0 ? (
              currentUser.geographyScopes.map((scope) => (
                <span className="setup-scope-pill" key={scope}>
                  {formatGeographyPath(scope)}
                </span>
              ))
            ) : (
              <span className="setup-scope-pill">No geography scope assigned</span>
            )}
          </div>
        </DataCard>

        {userCanManageUsers ? (
          <DataCard
            eyebrow="Administration"
            title="Manage users"
            actions={
              <span className="setup-user-count-badge">
                {users.length} {users.length === 1 ? "user" : "users"}
              </span>
            }
          >
            {userError ? <ErrorBanner message={userError} /> : null}

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
                Phone
                <input
                  placeholder="+1 555 0100"
                  type="tel"
                  value={newUser.phone}
                  onChange={(event) =>
                    setNewUser((draft) => ({
                      ...draft,
                      phone: event.target.value,
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
                className="primary-button user-setup-form-submit"
                type="button"
                disabled={isSavingUser || geographies.length === 0}
                onClick={addUser}
              >
                {isSavingUser ? "Creating user" : "Create user"}
              </button>
            </div>

            <div className="user-setup-list">
              <div className="user-list-header">
                <span>Name / Email</span>
                <span>Role</span>
                <span>Geography</span>
                <span>Status</span>
                <span />
              </div>
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
                      phone={user.phone}
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
          </DataCard>
        ) : null}

        {userCanManageUsers ? (
          <DataCard
            eyebrow="Deployment"
            title={setupStatus?.completed ? "Setup complete" : "Setup required"}
          >
            <div className="setup-fact-grid">
              <div className="setup-fact">
                <span>Country</span>
                <strong>{setupStatus?.countryName ?? "Not set"}</strong>
              </div>
              <div className="setup-fact">
                <span>Selected hazards</span>
                <strong>{setupStatus?.selectedHazards.length ?? 0}</strong>
              </div>
              <div className="setup-fact">
                <span>Workspace members</span>
                <strong>{setupStatus?.counts.workspaceMembers ?? 0}</strong>
              </div>
            </div>
            {isResetConfirming ? (
              <div className="setup-reset-confirm">
                <strong>Reset setup and sign out?</strong>
                <p>
                  This clears the current workspace setup state and returns CHART to
                  first-run onboarding.
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
          </DataCard>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}

function UserRow({
  action,
  email,
  geography,
  name,
  phone,
  role,
  status,
}: {
  action?: ReactNode;
  email: string;
  geography: string;
  name: string;
  phone?: string;
  role: ChartRole | undefined;
  status: string;
}) {
  return (
    <div className="user-setup-row">
      <div>
        <strong>{name}</strong>
        <span>{email}</span>
        {phone ? <span>{phone}</span> : null}
      </div>
      <span>{formatRole(role)}</span>
      <span>{formatGeographyPath(geography)}</span>
      <b>{status}</b>
      {action}
    </div>
  );
}
