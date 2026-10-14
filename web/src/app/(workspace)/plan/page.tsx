"use client";

import { useSession } from "@/features/auth/WorkspaceSession";
import { PlanningApp } from "@/features/planning";

/** Accounts without a planning area are sent to /access-pending by the
 * workspace layout before this renders. */
export default function PlanPage() {
  const { user } = useSession();
  return (
    <PlanningApp
      geographyScopes={user.geographyScopes}
      activeGeographyId={user.activeGeographyId}
    />
  );
}
