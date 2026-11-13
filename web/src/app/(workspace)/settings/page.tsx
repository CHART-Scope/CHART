"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Tabs, type TabItem } from "@/components/Tabs";
import { useSession } from "@/features/auth/WorkspaceSession";
import {
  ClimateDataCard,
  GeographyContextCard,
  SettingsSkeleton,
} from "@/features/planning";
import { ResetInstallationCard } from "@/features/planning/ResetInstallationCard";
import { HeatSeasonsCard } from "@/features/settings/HeatSeasonsCard";
import { JobsCard } from "@/features/settings/JobsCard";
import { ModelReleasesCard } from "@/features/settings/ModelReleasesCard";
import { ModelSettingsCard } from "@/features/settings/ModelSettingsCard";
import { RecommendationSettingsCard } from "@/features/settings/RecommendationSettingsCard";
import { DepartmentsCard } from "@/features/settings/DepartmentsCard";
import { MyAccessCard } from "@/features/settings/MyAccessCard";
import { PeopleCard } from "@/features/settings/PeopleCard";
import { RolesCard } from "@/features/settings/RolesCard";
import {
  useWorkspaceChoice,
  WorkspacePicker,
} from "@/features/settings/WorkspaceChoice";
import { WorkspacesCard } from "@/features/settings/WorkspacesCard";
import { VraIndicatorsCard } from "@/features/vulnerability";
import { can, type AccessHolder } from "@/lib/access";
import { isLive, useBackgroundJobs } from "@/lib/backgroundJobs";

import styles from "./page.module.css";

type Tab =
  | "workspace"
  | "people"
  | "departments"
  | "roles"
  | "models"
  | "seasons"
  | "data"
  | "vra"
  | "recommendations"
  | "jobs"
  | "workspaces";

/** Each tab asks for its own capability (docs/access-control.md). */
const TABS: { tab: Tab; allowed: (user: AccessHolder) => boolean }[] = [
  { tab: "workspace", allowed: () => true },
  { tab: "people", allowed: (user) => can(user, "people", "read") },
  { tab: "departments", allowed: (user) => can(user, "departments", "read") },
  { tab: "roles", allowed: (user) => can(user, "workspace", "manage") },
  { tab: "models", allowed: () => true },
  { tab: "seasons", allowed: (user) => can(user, "seasons", "manage") },
  { tab: "data", allowed: (user) => can(user, "data", "write") },
  { tab: "vra", allowed: (user) => can(user, "vra", "write") },
  { tab: "recommendations", allowed: (user) => user.isPlatformAdmin },
  { tab: "jobs", allowed: (user) => can(user, "data", "write") },
  { tab: "workspaces", allowed: (user) => user.isPlatformAdmin },
];
const LABELS: Record<Tab, string> = {
  workspace: "Workspace",
  people: "People",
  departments: "Departments",
  roles: "Roles",
  workspaces: "Workspaces",
  models: "Models",
  seasons: "Heat seasons",
  data: "Data",
  vra: "VRA",
  recommendations: "Recommendations",
  jobs: "Jobs",
};

/**
 * Settings, one tab at a time, each shown to those whose capabilities let
 * them use it. Workspace is your planning location and your own access (with
 * the installation reset folded away for platform admins). People, Departments
 * and Roles run the country's workspace; Workspaces lists every country for
 * platform admins. Models holds the model options (and, for platform admins,
 * the installed releases); Heat seasons, Data, VRA, Recommendations and Jobs
 * are for those who manage them. The tab lives in `?tab=`, so it can be linked
 * to and survives a reload; a tab the user may not open falls back to
 * Workspace.
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
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const user = session.user;
  const allowed: Tab[] = TABS.filter((item) => item.allowed(user)).map(
    (item) => item.tab,
  );
  const choice = useWorkspaceChoice(user.activeGeographyId);
  const workspace = choice.workspace;
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

  const liveJobs =
    useBackgroundJobs(allowed.includes("jobs")).jobs?.filter(isLive).length ?? 0;
  const items: TabItem<Tab>[] = allowed.map((value) => ({
    value,
    label: value === "jobs" && liveJobs > 0 ? `Jobs (${liveJobs})` : LABELS[value],
  }));

  // Tabs already opened stay mounted, hidden: going back is instant, keeps
  // any half-filled form, and does not re-read what the card just loaded.
  const [visited, setVisited] = useState<Tab[]>([tab]);
  if (!visited.includes(tab)) setVisited([...visited, tab]);

  const panels: Record<Tab, ReactNode> = {
    workspace: (
      <>
        <GeographyContextCard
          geographyScopes={user.geographyScopes}
          activeGeographyId={user.activeGeographyId}
        />
        <MyAccessCard user={user} />
        {user.isPlatformAdmin ? (
          <ResetInstallationCard accessToken={session.accessToken} />
        ) : null}
      </>
    ),
    people: workspace ? <PeopleCard user={user} workspace={workspace} /> : null,
    departments: workspace ? (
      <DepartmentsCard user={user} workspace={workspace} />
    ) : null,
    roles: workspace ? <RolesCard workspace={workspace} /> : null,
    workspaces: <WorkspacesCard choice={choice} />,
    models: (
      <>
        <ModelSettingsCard
          accessToken={session.accessToken}
          activeGeographyId={user.activeGeographyId}
          canEdit={(countryPath) => can(user, "risk", "manage", countryPath)}
        />
        {user.isPlatformAdmin ? (
          <ModelReleasesCard accessToken={session.accessToken} />
        ) : null}
      </>
    ),
    seasons: <HeatSeasonsCard canEdit />,
    data: <ClimateDataCard accessToken={session.accessToken} />,
    vra: (
      <VraIndicatorsCard
        accessToken={session.accessToken}
        geographyScopes={user.geographyScopes}
        activeGeographyId={user.activeGeographyId}
        initialFrame={searchParams.get("vra_frame")}
      />
    ),
    recommendations: <RecommendationSettingsCard />,
    jobs: <JobsCard />,
  };
  const panel = visited
    .filter((value) => allowed.includes(value))
    .map((value) => (
      <div key={value} hidden={value !== tab} className={styles.panelGroup}>
        {panels[value]}
      </div>
    ));

  return (
    <div className={styles.layout}>
      <PageHeader
        kicker="Settings"
        title="Shape how CHART plans with you"
        lede="Who plans together and what each person may do, your departments, and which model options the dashboard offers."
      />
      {["people", "departments", "roles"].includes(tab) ? (
        <WorkspacePicker choice={choice} />
      ) : null}
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
