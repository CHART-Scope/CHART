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
import { HeatSeasonsCard } from "@/features/settings/HeatSeasonsCard";
import { JobsCard } from "@/features/settings/JobsCard";
import { ModelReleasesCard } from "@/features/settings/ModelReleasesCard";
import { ModelSettingsCard } from "@/features/settings/ModelSettingsCard";
import { RecommendationSettingsCard } from "@/features/settings/RecommendationSettingsCard";
import { VraIndicatorsCard } from "@/features/vulnerability";
import { isLive, useBackgroundJobs } from "@/lib/backgroundJobs";

import styles from "./page.module.css";

type Tab =
  "workspace" | "models" | "seasons" | "data" | "vra" | "recommendations" | "jobs";

/** Every signed-in planner: where they plan, and what the models offer. */
const PLANNER_TABS: Tab[] = ["workspace", "models"];
/** Installation tabs, administrators only. */
const ADMIN_TABS: Tab[] = ["seasons", "data", "vra", "recommendations", "jobs"];
const LABELS: Record<Tab, string> = {
  workspace: "Workspace",
  models: "Models",
  seasons: "Heat seasons",
  data: "Data",
  vra: "VRA",
  recommendations: "Recommendations",
  jobs: "Jobs",
};

/**
 * Settings, one tab at a time. Workspace is about where and with whom you
 * plan: the planning location, and for administrators the people with
 * access (with the reset folded away at its foot). Models
 * holds every model option and, for administrators, the installed releases.
 * Administrators also get Heat seasons, climate Data, the vulnerability
 * assessment (VRA), Recommendations and background Jobs. The tab lives in
 * `?tab=`, so it can be linked to and survives a reload; a tab the user may
 * not open falls back to Workspace.
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
  const isAdmin = session.user.roles.includes("chart_admin");
  const allowed: Tab[] = isAdmin ? [...PLANNER_TABS, ...ADMIN_TABS] : PLANNER_TABS;
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
        {isAdmin ? (
          <>
            <UserManagement accessToken={session.accessToken} />
            <ResetInstallationCard accessToken={session.accessToken} />
          </>
        ) : null}
      </>
    ),
    models: (
      <>
        <ModelSettingsCard
          accessToken={session.accessToken}
          activeGeographyId={session.user.activeGeographyId}
        />
        {isAdmin ? <ModelReleasesCard accessToken={session.accessToken} /> : null}
      </>
    ),
    seasons: <HeatSeasonsCard canEdit />,
    data: <ClimateDataCard accessToken={session.accessToken} />,
    vra: (
      <VraIndicatorsCard
        accessToken={session.accessToken}
        geographyScopes={session.user.geographyScopes}
        activeGeographyId={session.user.activeGeographyId}
        initialFrame={searchParams.get("vra_frame")}
      />
    ),
    recommendations: <RecommendationSettingsCard />,
    jobs: <JobsCard />,
  }[tab];

  return (
    <div className={styles.layout}>
      <PageHeader
        kicker="Settings"
        title="Shape how CHART plans with you"
        lede={
          isAdmin
            ? "Where you plan, who has access and which model options the dashboard offers, plus this installation's heat seasons, data, vulnerability assessment and background jobs."
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
