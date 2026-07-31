"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import {
  HeatLbwLinkPanel,
  PredictionsPanel,
  RiskProtectionPanel,
} from "@/features/dashboard";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<{ admin_unit?: string }>;
};

export default function DashboardGeoPage(props: PageProps) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);
  const adminUnit = searchParams.admin_unit ?? null;

  return (
    <RequireAuth>
      {(session) => (
        <AuthorizedDashboard
          session={session}
          geographyId={params.geo}
          adminUnit={adminUnit}
        />
      )}
    </RequireAuth>
  );
}


function AuthorizedDashboard({
  session,
  geographyId,
  adminUnit,
}: {
  session: AuthSession;
  geographyId: string;
  adminUnit: string | null;
}) {
  const router = useRouter();
  const hasAccess = useMemo(
    () =>
      session.user.roles.length > 0 && session.user.geographyScopes.length > 0,
    [session.user.roles, session.user.geographyScopes],
  );

  useEffect(() => {
    if (!hasAccess) router.replace("/access-pending");
  }, [hasAccess, router]);

  const nav = appNavForRoles(session.user.roles);
  const handleNavigate = useCallback(
    (id: string) => {
      const target = NAV_ROUTE[id];
      if (target) router.push(target);
    },
    [router],
  );

  if (!hasAccess) return null;

  return (
    <>
      <IconSprite />
      <AppShell
        nav={nav}
        activeNav="planning"
        onNavigate={handleNavigate}
        onSignOut={signOutOfKeycloak}
        userLabel={session.user.username}
      >
        <main className={styles.page}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Understand the climate-health risk</p>
            <h1 className={styles.title}>
              Protecting mothers and babies from extreme heat: The science and
              actions that can save lives
            </h1>
          </header>

          <div className={styles.grid}>
            <RiskProtectionPanel />
            <HeatLbwLinkPanel
              activeAdminUnitCode={adminUnit}
              onAdminUnitChange={(code) => {
                const url = `/dashboard/${geographyId}?admin_unit=${encodeURIComponent(code)}`;
                router.push(url);
              }}
            />
            <PredictionsPanel
              geographyId={geographyId}
              adminUnit={adminUnit}
              accessToken={session.accessToken}
            />
          </div>

          <section className={styles.recommendedActions}>
            <p className={styles.recommendedEyebrow}>Recommended actions</p>
            <p className={styles.recommendedBody}>
              Actions from the reviewed solutions repository will appear here
              once your first prediction has completed.
            </p>
          </section>
        </main>
      </AppShell>
    </>
  );
}
