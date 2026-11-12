import type { CurrentUser } from "@/lib/authClient";
import { listGeographies } from "@/lib/planningClient";
import { getQueryClient } from "@/lib/queryClient";
import { geographiesQueryKey } from "@/lib/useGeographies";
import { dashboardHref } from "@/features/dashboard/dashboardNavigation";
import {
  dashboardTarget,
  defaultPlanningArea,
} from "@/features/planning/contextFamilies";

/** The dashboard of the area Start planning would open for this person. */
export async function dashboardPath(user: CurrentUser) {
  // Read into the shared cache, so the dashboard it opens has its places.
  const geographies = await getQueryClient().fetchQuery({
    queryKey: geographiesQueryKey,
    queryFn: () => listGeographies(),
  });
  const area = defaultPlanningArea(
    geographies,
    user.geographyScopes,
    user.activeGeographyId,
  );
  if (!area) return "/plan";
  return dashboardHref({
    ...dashboardTarget(area, geographies, user.geographyScopes),
    outcome: "",
    choices: {},
  });
}
