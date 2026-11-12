import { Skeleton, SkeletonCard, SkeletonText } from "@/components/Skeleton";
import { DashboardSkeleton } from "@/features/dashboard/DashboardSkeleton";
import { SettingsSkeleton } from "@/features/planning/SettingsSkeleton";

/** A content-area placeholder for workspace pages without a shaped one. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <SkeletonCard label="Loading the page">
        <Skeleton width="40%" height="1.5rem" />
        <SkeletonText lines={4} />
      </SkeletonCard>
    </div>
  );
}

/**
 * The content placeholder for a workspace route, drawn inside the shell while
 * the session is restored or a redirect is under way, so the sidebar and top
 * bar never disappear around it.
 */
export function RouteSkeleton({ pathname }: { pathname: string | null }) {
  if (pathname === "/settings") return <SettingsSkeleton />;
  if (pathname && /^\/dashboard\/[^/]+$/.test(pathname)) return <DashboardSkeleton />;
  return <PageSkeleton />;
}
