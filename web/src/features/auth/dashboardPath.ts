import type { CurrentUser } from "@/lib/authClient";
import { listGeographies } from "@/lib/planningClient";
import { defaultPlanningArea } from "@/features/planning/contextFamilies";

/** The dashboard of the area Start planning would open for this person. */
export async function dashboardPath(user: CurrentUser) {
  const area = defaultPlanningArea(
    await listGeographies(),
    user.geographyScopes,
    user.activeGeographyId,
  );
  return area ? `/dashboard/${encodeURIComponent(area.id)}` : "/plan";
}
