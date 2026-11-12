"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { DashboardOverview } from "@/features/dashboard/DashboardOverview";
import type { DashboardSearch } from "@/features/dashboard/dashboardNavigation";

/**
 * Hosts the dashboard overview above the `[geo]` segment. A page under
 * `[geo]` remounts whenever the place changes - the map, every card and every
 * request started again from blank. A layout above it stays mounted, so a
 * location switch only changes the overview's props. Deeper routes (actions,
 * runs) render as usual.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { geo } = useParams<{ geo: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useMemo(
    () => Object.fromEntries(searchParams) as DashboardSearch,
    [searchParams],
  );
  const isOverview = /^\/dashboard\/[^/]+\/?$/.test(pathname);

  if (!isOverview) return children;
  return <DashboardOverview geographyId={geo} search={search} />;
}
