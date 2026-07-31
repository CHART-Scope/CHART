"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { PlanningApp } from "@/features/planning";
import { signOutOfKeycloak, type AuthSession } from "@/lib/authClient";

export default function PlanPage() {
  return <RequireAuth>{(session) => <AuthorizedPlan session={session} />}</RequireAuth>;
}

function AuthorizedPlan({ session }: { session: AuthSession }) {
  const router = useRouter();
  const hasAccess =
    session.user.roles.length > 0 && session.user.geographyScopes.length > 0;

  useEffect(() => {
    if (!hasAccess) router.replace("/access-pending");
  }, [hasAccess, router]);

  if (!hasAccess) return null;

  return (
    <PlanningApp
      accessToken={session.accessToken}
      username={session.user.username}
      roles={session.user.roles}
      geographyScopes={session.user.geographyScopes}
      activeGeographyId={session.user.activeGeographyId}
      onSignOut={signOutOfKeycloak}
    />
  );
}
