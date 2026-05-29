"use client";

import { RequireAuth } from "../auth/RequireAuth";
import { CmsPage } from "../cms/CmsPage";
import { useChartNavigator } from "./useChartNavigator";

export function CmsRoutePage() {
  const navigate = useChartNavigator();

  return (
    <RequireAuth>
      {(_session, signOut) => <CmsPage onNavigate={navigate} onSignOut={signOut} />}
    </RequireAuth>
  );
}
