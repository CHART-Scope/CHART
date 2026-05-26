import type { ReactNode } from "react";

type WorkspaceShellProps = {
  activeRoute: "dashboard" | "cms";
  pageTitle: string;
  crumb: string;
  onNavigate: (route: "landing" | "dashboard" | "cms") => void;
  children: ReactNode;
};

export function WorkspaceShell({
  activeRoute,
  pageTitle,
  crumb,
  onNavigate,
  children,
}: WorkspaceShellProps) {
  const today = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

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
          className={`workspace-item ${activeRoute === "cms" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("cms")}
        >
          <span className="workspace-dot" />
          <span>Content studio</span>
        </button>

        <div className="workspace-section-label">Public</div>
        <button
          className="workspace-item"
          type="button"
          onClick={() => onNavigate("landing")}
        >
          <span className="workspace-dot public" />
          <span>Landing page</span>
        </button>

        <div className="workspace-sidebar-foot">
          Shared planning for climate-health teams. Public resources stay open; scoped
          planning stays inside the workspace.
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
            <div className="workspace-avatar">AB</div>
          </div>
        </header>

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
