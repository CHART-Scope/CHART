"use client";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { PlanningApp } from "@/features/planning";
import { signOutOfKeycloak } from "@/lib/authClient";

export default function PlanPage() {
  return (
    <RequireAuth>
      {(session) => (
        <PlanningApp
          accessToken={session.accessToken}
          username={session.user.username}
          geographyScopes={session.user.geographyScopes}
          activeGeographyId={session.user.activeGeographyId}
          onSignOut={signOutOfKeycloak}
        />
      )}
    </RequireAuth>
  );
}
