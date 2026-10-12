"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { LearningLibrary } from "@/features/learning";
import {
  ensureFreshAuthSession,
  getStoredAuthSession,
  refreshDelay,
  restoreAuthSession,
  signOutOfKeycloak,
  startKeycloakSignIn,
  type AuthSession,
} from "@/lib/authClient";
import styles from "@/features/onboarding/Login.module.css";

export default function LearningPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const stored = getStoredAuthSession();
    const pending = stored ? ensureFreshAuthSession(stored) : restoreAuthSession();
    pending
      .then((fresh) => {
        if (!cancelled) setSession(fresh);
      })
      .catch(() => {
        // Visitors can browse without a session.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const delay = refreshDelay(session.accessToken);
    if (delay === null) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      ensureFreshAuthSession(session)
        .then((fresh) => {
          if (!cancelled) setSession(fresh);
        })
        .catch(() => {
          if (!cancelled) setSession(null);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [session]);

  if (session) return <AuthorizedLearning session={session} />;

  return (
    <div className={styles.page}>
      <IconSprite />
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="CHART home">
          CHART
        </a>
        <Button onClick={startKeycloakSignIn}>Sign in</Button>
      </header>
      <main>
        <LearningLibrary onStartPlanning={() => router.push("/plan")} />
      </main>
    </div>
  );
}

function AuthorizedLearning({ session }: { session: AuthSession }) {
  const router = useRouter();

  const handleNavigate = useCallback(
    (id: string) => {
      const target = NAV_ROUTE[id];
      if (target) router.push(target);
    },
    [router],
  );

  return (
    <>
      <IconSprite />
      <AppShell
        nav={appNavForRoles(session.user.roles)}
        activeNav="learning"
        onNavigate={handleNavigate}
        onSignOut={signOutOfKeycloak}
        userLabel={session.user.username}
      >
        <main>
          <LearningLibrary
            accessToken={session.accessToken}
            onStartPlanning={() => router.push("/plan")}
          />
        </main>
      </AppShell>
    </>
  );
}
