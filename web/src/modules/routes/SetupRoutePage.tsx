"use client";

import { RequireAuth } from "../auth/RequireAuth";
import { SetupPage } from "../setup/SetupPage";
import { useChartNavigator } from "./useChartNavigator";

export function SetupRoutePage() {
  const navigate = useChartNavigator();

  return (
    <RequireAuth>
      {(session, signOut) => (
        <SetupPage
          accessToken={session.accessToken}
          currentUser={session.user}
          onNavigate={navigate}
          onSignOut={signOut}
        />
      )}
    </RequireAuth>
  );
}
