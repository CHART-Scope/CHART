"use client";

import { useState, type ReactNode } from "react";

import type { CurrentUserContext } from "../auth/authClient";
import {
  formatGeographyPath,
  formatRole,
  getUserProfile,
  userInitials,
} from "../auth/userContext";
import type { ChartRoute } from "../routes/types";

type WorkspaceShellProps = {
  activeRoute: "dashboard" | "setup";
  pageTitle: string;
  crumb: string;
  onNavigate: (route: ChartRoute) => void;
  currentUser?: CurrentUserContext;
  onSignOut?: (returnTo?: string) => void;
  children: ReactNode;
};

export function WorkspaceShell({
  activeRoute,
  pageTitle,
  crumb,
  onNavigate,
  currentUser,
  onSignOut,
  children,
}: WorkspaceShellProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const today = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const profile = currentUser ? getUserProfile(currentUser) : undefined;

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <button
          className="workspace-brand"
          type="button"
          onClick={() => onNavigate("landing")}
        >
          CHART
          <small>Toolkit</small>
        </button>

        <div className="workspace-section-label">Workspace</div>
        <button
          className={`workspace-item ${activeRoute === "dashboard" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("dashboard")}
        >
          <span className="workspace-dot" />
          <span>Dashboard</span>
        </button>
        <button
          className={`workspace-item ${activeRoute === "setup" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("setup")}
        >
          <span className="workspace-dot" />
          <span>Profile & setup</span>
        </button>

        <div className="workspace-section-label">Public</div>
        <button
          className="workspace-item"
          type="button"
          onClick={() => onNavigate("solutions")}
        >
          <span className="workspace-dot public" />
          <span>Action repository</span>
        </button>
        <button
          className="workspace-item"
          type="button"
          onClick={() => onNavigate("landing")}
        >
          <span className="workspace-dot public" />
          <span>Landing page</span>
        </button>

        <div className="workspace-sidebar-foot">
          {onSignOut ? (
            <button
              className="workspace-signout"
              type="button"
              onClick={() => onSignOut()}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <div className="workspace-crumb">{crumb}</div>
            <div className="workspace-title">{pageTitle}</div>
          </div>
          <div className="workspace-topbar-right">
            <div className="workspace-date">{today}</div>
            {onSignOut ? (
              <button
                className="topbar-signout"
                type="button"
                onClick={() => onSignOut()}
              >
                Sign out
              </button>
            ) : null}
            {currentUser ? (
              <div className="workspace-profile-menu">
                <button
                  aria-expanded={isProfileOpen}
                  className="workspace-avatar-button"
                  type="button"
                  onClick={() => setIsProfileOpen((value) => !value)}
                >
                  <span className="workspace-avatar">{userInitials(currentUser)}</span>
                  <span className="workspace-avatar-copy">
                    <strong>{currentUser.username}</strong>
                    <small>{formatRole(currentUser.roles[0])}</small>
                  </span>
                </button>

                {isProfileOpen ? (
                  <div className="profile-popover">
                    <span className="section-kicker">Signed in profile</span>
                    <h3>{profile?.roleLabel}</h3>
                    <div className="profile-fact">
                      <span>Active geography</span>
                      <strong>
                        {formatGeographyPath(
                          currentUser.activeGeographyId ??
                            currentUser.geographyScopes[0],
                        )}
                      </strong>
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setIsProfileOpen(false);
                        onNavigate("setup");
                      }}
                    >
                      Open profile setup
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="workspace-avatar">CH</div>
            )}
          </div>
        </header>

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
