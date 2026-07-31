"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo } from "react";

import { AppShell, type NavItem } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { PredictionsPanel } from "@/features/dashboard";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";

import styles from "./page.module.css";


const planningNav: NavItem = {
  id: "planning",
  label: "Planning center",
  icon: "users",
};

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<{ admin_unit?: string }>;
};

export default function DashboardGeoPage(props: PageProps) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);
  // Omit admin_unit entirely when the caller hasn't picked one - the
  // backend then resolves the default admin_unit linked to the geography
  // that was chosen during onboarding.
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

  const nav: NavItem[] = session.user.roles.includes("chart_admin")
    ? [planningNav, { id: "users", label: "People & access", icon: "settings" }]
    : [planningNav];

  const handleNavigate = useCallback(
    (id: string) => {
      if (id === "planning") router.push("/plan");
      else if (id === "users") router.push("/plan");
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
            <p className={styles.eyebrow}>CHART · Dashboard</p>
            <h1 className={styles.title}>
              Protecting mothers and babies from extreme heat
            </h1>
            <p className={styles.subtitle}>
              Viewing for <strong>{adminUnit ?? geographyId}</strong>
            </p>
          </header>
          <div className={styles.grid}>
            <div className={styles.panels}>
              <PredictionsPanel
                geographyId={geographyId}
                adminUnit={adminUnit}
                accessToken={session.accessToken}
              />
            </div>
          </div>
        </main>
      </AppShell>
    </>
  );
}
