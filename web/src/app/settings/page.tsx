"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import { AppShell } from "@/components/AppShell";
import { IconSprite } from "@/components/Icon";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { appNavForRoles, NAV_ROUTE } from "@/features/chrome/appNav";
import { UserManagement } from "@/features/planning";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";

export default function SettingsPage() {
  return (
    <RequireAuth>{(session) => <AuthorizedSettings session={session} />}</RequireAuth>
  );
}

function AuthorizedSettings({ session }: { session: AuthSession }) {
  const router = useRouter();
  const isAdmin = session.user.roles.includes("chart_admin");

  useEffect(() => {
    if (!isAdmin) router.replace("/plan");
  }, [isAdmin, router]);

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
        <UserManagement accessToken={session.accessToken} />
      </AppShell>
    </>
  );
}
