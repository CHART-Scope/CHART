import type { NavItem } from "@/components/AppShell";

/** The ids the shell knows about. A union rather than `string` so a typo in
 * `activeNav` or a route lookup is a compile error instead of a
 * silently dead nav item. */
export type NavId = "learning" | "planning" | "vulnerability" | "settings";

/** Roles that may read the risk map, and so the vulnerability assessment
 * (the API checks the same list). */
export const RISK_READER_ROLES = [
  "chart_admin",
  "health_planning_lead",
  "cross_sector_planning_lead",
  "health_implementation_officer",
  "cross_sector_implementation_officer",
  "public_viewer",
] as const;

type NavDefinition = NavItem & {
  id: NavId;
  href: string;
  /** Roles allowed to use the destination. Omitted means every signed-in
   * role — the destination itself imposes no role check. */
  requiredRoles?: readonly string[];
  /** Destinations that bounce an account with no planning area straight to
   * /access-pending (see `signedInHomePath`), so offering them is a dead end. */
  requiresGeographyScope?: boolean;
};

// One table, not two. The label/icon list and the id → route map used to be
// separate declarations, so an id could exist in one and not the other and the
// nav item would simply do nothing when clicked.
const NAV: readonly NavDefinition[] = [
  { id: "learning", label: "Learning hub", icon: "book", href: "/learning" },
  {
    id: "planning",
    label: "Start planning",
    icon: "users",
    href: "/plan",
    requiresGeographyScope: true,
  },
  {
    id: "vulnerability",
    label: "Vulnerability",
    icon: "alert-triangle",
    href: "/vulnerability",
    requiredRoles: RISK_READER_ROLES,
    requiresGeographyScope: true,
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    href: "/settings",
    // Model settings are editable by any signed-in user with a planning
    // area; the installation cards on the page stay admin-only.
    requiresGeographyScope: true,
  },
] as const;

export type NavAudience = {
  /** Geography scopes from the session. Optional: callers that do not pass
   * it keep the previous role-only behaviour. */
  geographyScopes?: readonly string[];
};

export function appNavForRoles(
  roles: readonly string[],
  audience: NavAudience = {},
): NavItem[] {
  return NAV.filter((item) => {
    if (
      item.requiredRoles &&
      !item.requiredRoles.some((role) => roles.includes(role))
    ) {
      return false;
    }
    // Only judge scope when the caller actually supplied it — an absent list
    // means "unknown", which must not be read as "none".
    if (
      item.requiresGeographyScope &&
      audience.geographyScopes &&
      audience.geographyScopes.length === 0
    ) {
      return false;
    }
    return true;
  }).map(({ requiredRoles, requiresGeographyScope, ...item }) => item);
}

/**
 * Which nav entry a path belongs to. The dashboard and its run detail pages
 * live under /dashboard but are reached from "Start planning", so they have to
 * map back to that entry or the sidebar highlights nothing while a user is
 * deep in the product.
 */
export function activeNavForPath(pathname: string | null): NavId | null {
  if (!pathname) return null;
  if (pathname.startsWith("/plan") || pathname.startsWith("/dashboard")) {
    return "planning";
  }
  if (pathname.startsWith("/learning")) return "learning";
  if (pathname.startsWith("/vulnerability")) return "vulnerability";
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}

/** Workspace routes a visitor may read without signing in. */
export function isPublicPath(pathname: string | null): boolean {
  return activeNavForPath(pathname) === "learning";
}

/**
 * Where a signed-in user who may not use `pathname` is sent instead, or null.
 * Read from the same table as the nav, so a hidden entry and a guarded route
 * cannot disagree: no planning area means /access-pending, a missing role
 * falls back to planning.
 */
export function redirectForPath(
  pathname: string | null,
  user: { roles: readonly string[]; geographyScopes: readonly string[] },
): string | null {
  const entry = NAV.find((item) => item.id === activeNavForPath(pathname));
  if (!entry) return null;
  if (
    entry.requiresGeographyScope &&
    (user.roles.length === 0 || user.geographyScopes.length === 0)
  ) {
    return "/access-pending";
  }
  if (
    entry.requiredRoles &&
    !entry.requiredRoles.some((role) => user.roles.includes(role))
  ) {
    return "/plan";
  }
  return null;
}
