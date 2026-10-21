"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Tabs, type TabItem } from "@/components/Tabs";
import { useSession } from "@/features/auth/WorkspaceSession";
import {
  ClimateDataCard,
  GeographyContextCard,
  SettingsSkeleton,
  UserManagement,
} from "@/features/planning";
import { ResetInstallationCard } from "@/features/planning/ResetInstallationCard";
import { JobsCard } from "@/features/settings/JobsCard";
import { ModelReleasesCard } from "@/features/settings/ModelReleasesCard";
import { ModelSettingsCard } from "@/features/settings/ModelSettingsCard";
import { isLive, useBackgroundJobs } from "@/lib/backgroundJobs";

import styles from "./page.module.css";

type Tab = "workspace" | "data" | "models" | "users" | "jobs";

/** Installation tabs, after Workspace; administrators only. */
const ADMIN_TABS: Tab[] = ["data", "models", "users", "jobs"];
const LABELS: Record<Tab, string> = {
  workspace: "Workspace",
  data: "Data",
  models: "Models",
  users: "Users",
  jobs: "Jobs",
};

/**
 * Settings, one tab at a time. Every signed-in user with a planning area has
 * Workspace (planning location and model options). Administrators also get
 * the installation tabs: climate Data, Models, Users (with the reset folded
 * away at its foot) and background Jobs. The tab lives in `?tab=`, so it can
 * be linked to and survives a reload; a tab the user may not open falls back
 * to Workspace.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const session = useSession();
  const pathname = usePathname();
  const requested = useSearchParams().get("tab");
  const isAdmin = session.user.roles.includes("chart_admin");
  const allowed: Tab[] = isAdmin ? ["workspace", ...ADMIN_TABS] : ["workspace"];
  const tab = allowed.find((item) => item === requested) ?? "workspace";

  // The tab is client state mirrored into the URL: the native History API
  // updates `useSearchParams` without a server round trip. A denied or
  // unknown tab is dropped rather than left to claim a view not shown.
  const show = (next: Tab) =>
    window.history.replaceState(
      null,
      "",
      next === "workspace" ? pathname : `${pathname}?tab=${next}`,
    );
  useEffect(() => {
    if (requested !== null && requested !== tab)
      window.history.replaceState(null, "", pathname);
  }, [pathname, requested, tab]);

  const liveJobs = useBackgroundJobs(isAdmin).jobs?.filter(isLive).length ?? 0;
  const items: TabItem<Tab>[] = allowed.map((value) => ({
    value,
    label: value === "jobs" && liveJobs > 0 ? `Jobs (${liveJobs})` : LABELS[value],
  }));

  const panel = {
    workspace: (
      <>
        <GeographyContextCard
          geographyScopes={session.user.geographyScopes}
          activeGeographyId={session.user.activeGeographyId}
        />
        <ModelSettingsCard
          accessToken={session.accessToken}
          activeGeographyId={session.user.activeGeographyId}
        />
      </>
    ),
    data: <ClimateDataCard accessToken={session.accessToken} />,
    models: <ModelReleasesCard accessToken={session.accessToken} />,
    users: (
      <>
        <UserManagement accessToken={session.accessToken} />
        <ResetInstallationCard accessToken={session.accessToken} />
      </>
    ),
    jobs: <JobsCard />,
  }[tab];

  return (
    <div className={styles.layout}>
      <PageHeader
        kicker="Settings"
        title="Shape how CHART plans with you"
        lede={
          isAdmin
            ? "Where you plan and which model options the dashboard offers, plus this installation's data, models, people and background jobs."
            : "Choose where you plan and which model options the dashboard offers."
        }
      />
      {items.length > 1 ? (
        <Tabs items={items} value={tab} ariaLabel="Settings sections" onChange={show}>
          <div className={styles.panel}>{panel}</div>
        </Tabs>
      ) : (
        <div className={styles.panel}>{panel}</div>
      )}
    </div>
  );
}
