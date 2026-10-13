"use client";

import { useMemo } from "react";

import { useSession } from "@/features/auth/WorkspaceSession";
import { RunsStrip } from "@/features/dashboard";
import {
  ClimateDataCard,
  GeographyContextCard,
  ModelHubCard,
  UserManagement,
} from "@/features/planning";
import { ResetInstallationCard } from "@/features/planning/ResetInstallationCard";
import { ModelSettingsCard } from "@/features/settings/ModelSettingsCard";
import { useGeographies } from "@/lib/useGeographies";

import styles from "./page.module.css";

/**
 * Every signed-in user with a planning area can open Settings: the planning
 * location and model settings are theirs to change. The installation cards
 * (model hub, climate data, users, runs, reset) are for administrators.
 */
export default function SettingsPage() {
  const session = useSession();
  const scopes = session.user.geographyScopes;
  const isAdmin = session.user.roles.includes("chart_admin");
  // The shared cache, not a fetch of its own: the list is usually already in
  // memory from the dashboard or planning page, so the runs strip appears with
  // the rest of the page instead of popping in after a second request.
  const { geographies } = useGeographies();
  const runsGeography = useMemo(() => {
    if (!geographies) return null;
    const inScope = geographies.find((geo) =>
      scopes.some((scope) => geo.path === scope || geo.path.startsWith(`${scope}/`)),
    );
    return inScope ?? geographies[0] ?? null;
  }, [geographies, scopes]);

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <p className={styles.kicker}>Settings</p>
        <h1 className={styles.heading}>Shape how CHART plans with you</h1>
        <p className={styles.lede}>
          Choose where you plan and which model options the dashboard offers.
          {isAdmin ? " Installation tools for administrators follow below." : ""}
        </p>
      </header>

      <section className={styles.section} aria-labelledby="settings-workspace">
        <h2 id="settings-workspace" className={styles.sectionTitle}>
          Your workspace
        </h2>
        <GeographyContextCard
          geographyScopes={scopes}
          activeGeographyId={session.user.activeGeographyId}
        />
        <ModelSettingsCard accessToken={session.accessToken} />
      </section>

      {isAdmin ? (
        <section className={styles.section} aria-labelledby="settings-installation">
          <h2 id="settings-installation" className={styles.sectionTitle}>
            Installation <span className={styles.badge}>Admin</span>
          </h2>
          <div className={styles.pair}>
            <ModelHubCard accessToken={session.accessToken} />
            <ClimateDataCard accessToken={session.accessToken} />
          </div>
          <div className={styles.pair}>
            <UserManagement accessToken={session.accessToken} />
            {runsGeography ? (
              <div className={styles.runs}>
                <RunsStrip
                  geographyId={runsGeography.id}
                  adminUnit={null}
                  accessToken={session.accessToken}
                  linkForRun={(id) =>
                    `/dashboard/${encodeURIComponent(runsGeography.id)}/runs/${id}`
                  }
                />
              </div>
            ) : null}
          </div>
          <ResetInstallationCard accessToken={session.accessToken} />
        </section>
      ) : null}
    </div>
  );
}
