"use client";

import { RequireAuth } from "../auth/RequireAuth";
import { DashboardPage } from "../dashboard/DashboardPage";
import { useChartNavigator } from "./useChartNavigator";

export function DashboardRoutePage() {
  const navigate = useChartNavigator();

  return (
    <RequireAuth>
      {(session, signOut) => (
        <DashboardPage
          accessToken={session.accessToken}
          currentUser={session.user}
          onNavigate={navigate}
          onSignOut={signOut}
        />
      )}
    </RequireAuth>
  );
}
