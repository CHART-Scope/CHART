"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { RunDetail } from "@/features/dashboard";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";

import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ geo: string; requestId: string }>;
};

export default function RunDetailPage(props: PageProps) {
  const params = use(props.params);
  const parsedRequestId = Number.parseInt(params.requestId, 10);

  return (
    <RequireAuth>
      {(session) => (
        <AuthorizedRunDetail
          session={session}
          geographyId={params.geo}
          requestId={parsedRequestId}
        />
      )}
    </RequireAuth>
  );
}

function AuthorizedRunDetail({
  session,
  geographyId,
  requestId,
}: {
  session: AuthSession;
  geographyId: string;
  requestId: number;
}) {
  const router = useRouter();
  const hasAccess = useMemo(
    () => session.user.roles.length > 0 && session.user.geographyScopes.length > 0,
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

  const backHref = `/dashboard/${encodeURIComponent(geographyId)}`;

  if (!hasAccess) return null;

  if (!Number.isFinite(requestId)) {
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
            <p className={styles.empty}>
              That run identifier is not valid. <a href={backHref}>Back to dashboard</a>
            </p>
          </main>
        </AppShell>
      </>
    );
  }

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
          <RunDetail
            requestId={requestId}
            accessToken={session.accessToken}
            backHref={backHref}
          />
        </main>
      </AppShell>
    </>
  );
}
