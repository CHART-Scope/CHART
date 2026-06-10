"use client";

import { useState, type ReactNode } from "react";

import type { CurrentUserContext } from "../auth/authClient";
import {
  canManageContent,
  formatGeographyPath,
  formatRole,
  getUserProfile,
  userInitials,
} from "../auth/userContext";
import type { ChartRoute } from "../routes/types";

import "./WorkspaceShell.css";

type WorkspaceShellProps = {
  activeRoute: "dashboard" | "setup";
  pageTitle: string;
  pageSubtitle?: string;
  crumb?: string;
  onNavigate: (route: ChartRoute) => void;
  currentUser?: CurrentUserContext;
  onSignOut?: (returnTo?: string) => void;
  children: ReactNode;
};

export function WorkspaceShell({
  activeRoute,
  pageTitle,
  pageSubtitle,
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
  const userCanManageContent = currentUser ? canManageContent(currentUser) : false;

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <button
          className="workspace-brand"
          type="button"
          onClick={() => onNavigate("landing")}
        >
          CHART
          <small>v1</small>
        </button>

        <div className="workspace-section-label">Workspace</div>
        <button
          className={`workspace-item ${activeRoute === "dashboard" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("dashboard")}
        >
          <span className="workspace-dot" />
          <span>My dashboard</span>
        </button>
        <button
          className="workspace-item disabled"
          type="button"
          title="Coming soon"
          disabled
        >
          <span className="workspace-dot" />
          <span>My plans</span>
        </button>

        <div className="workspace-section-label">CHART Toolkit</div>
        <button
          className="workspace-item"
          type="button"
          onClick={() => onNavigate("solutions")}
        >
          <span className="workspace-dot public" />
          <span>Action repository</span>
        </button>

        {userCanManageContent ? (
          <>
            <div className="workspace-section-label">Admin</div>
            <button
              className={`workspace-item ${activeRoute === "setup" ? "active" : ""}`}
              type="button"
              onClick={() => onNavigate("setup")}
            >
              <span className="workspace-dot" />
              <span>Content studio</span>
            </button>
          </>
        ) : null}

        <div className="workspace-sidebar-foot">
          <button
            className="workspace-item"
            type="button"
            onClick={() => onNavigate("landing")}
          >
            <span className="workspace-dot public" />
            <span>Public site</span>
          </button>
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
          <div className="workspace-topbar-heading">
            {crumb ? <div className="workspace-crumb">{crumb}</div> : null}
            <h1>{pageTitle}</h1>
            {pageSubtitle ? <p>{pageSubtitle}</p> : null}
          </div>
          <div className="workspace-topbar-right">
            {currentUser ? (
              <span className="workspace-welcome">Welcome, {currentUser.username}</span>
            ) : null}
            <div className="workspace-date">{today}</div>
            <button className="ghost-button" type="button" disabled>
              Customize
            </button>
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
