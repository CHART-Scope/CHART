"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { LearningLibrary } from "@/features/learning";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";

export default function LearningPage() {
  return (
    <RequireAuth>{(session) => <AuthorizedLearning session={session} />}</RequireAuth>
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
