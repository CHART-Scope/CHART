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
      <div className={styles.pair}>
        <GeographyContextCard
          geographyScopes={scopes}
          activeGeographyId={session.user.activeGeographyId}
        />
        {isAdmin ? <ModelHubCard accessToken={session.accessToken} /> : null}
      </div>
      <ModelSettingsCard accessToken={session.accessToken} />
      {isAdmin ? (
        <>
          <ClimateDataCard accessToken={session.accessToken} />
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
        </>
      ) : null}
    </div>
  );
}
