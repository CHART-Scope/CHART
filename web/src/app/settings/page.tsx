"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";

import { ResetInstallationCard } from "@/features/planning/ResetInstallationCard";
import styles from "./page.module.css";
import { RunsStrip } from "@/features/dashboard";
import {
  ClimateDataCard,
  SettingsSkeleton,
  GeographyContextCard,
  ModelHubCard,
  UserManagement,
} from "@/features/planning";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";
import { listGeographies, type GeographyRecord } from "@/lib/planningClient";

export default function SettingsPage() {
  return (
    <RequireAuth fallback={<SettingsSkeleton />}>
      {(session) => <AuthorizedSettings session={session} />}
    </RequireAuth>
  );
}

function AuthorizedSettings({ session }: { session: AuthSession }) {
  const router = useRouter();
  const isAdmin = session.user.roles.includes("chart_admin");
  const [runsGeography, setRunsGeography] = useState<GeographyRecord | null>(null);

  useEffect(() => {
    if (!isAdmin) router.replace("/plan");
  }, [isAdmin, router]);

  useEffect(() => {
    let cancelled = false;
    listGeographies()
      .then((records) => {
        if (cancelled) return;
        const scopes = session.user.geographyScopes;
        const inScope = records.find((geo) =>
          scopes.some(
            (scope) => geo.path === scope || geo.path.startsWith(`${scope}/`),
          ),
        );
        setRunsGeography(inScope ?? records[0] ?? null);
      })
      .catch(() => setRunsGeography(null));
    return () => {
      cancelled = true;
    };
  }, [session.user.geographyScopes]);

  const handleNavigate = useCallback(
    (id: string) => {
      const target = NAV_ROUTE[id];
      if (target) router.push(target);
    },
    [router],
  );

  if (!isAdmin) return null;

  return (
    <>
      <IconSprite />
      <AppShell
        nav={appNavForRoles(session.user.roles)}
        activeNav="settings"
        onNavigate={handleNavigate}
        onSignOut={signOutOfKeycloak}
        userLabel={session.user.username}
      >
        <div className={styles.layout}>
          <div className={styles.pair}>
            <GeographyContextCard
              geographyScopes={session.user.geographyScopes}
              activeGeographyId={session.user.activeGeographyId}
            />
            <ModelHubCard />
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
      </AppShell>
    </>
  );
}
