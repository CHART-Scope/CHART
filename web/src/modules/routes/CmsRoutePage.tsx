"use client";

import { RequireAuth } from "../auth/RequireAuth";
import { CmsPage } from "../cms/CmsPage";
import { useChartNavigator } from "./useChartNavigator";

export function CmsRoutePage() {
  const navigate = useChartNavigator();

  return (
    <RequireAuth>
      {(session, signOut) => (
        <CmsPage currentUser={session.user} onNavigate={navigate} onSignOut={signOut} />
      )}
    </RequireAuth>
  );
}
