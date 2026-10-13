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
import { useGeographies } from "@/lib/useGeographies";

import styles from "./page.module.css";

/** Non-admins are sent to /plan by the workspace layout before this renders. */
export default function SettingsPage() {
  const session = useSession();
  const scopes = session.user.geographyScopes;
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
        <ModelHubCard accessToken={session.accessToken} />
      </div>
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
    </div>
  );
}
