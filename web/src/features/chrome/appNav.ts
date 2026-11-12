import type { NavItem } from "@/components/AppShell";
import { can, hasAccess, type AccessHolder, type Module } from "@/lib/access";

/** The ids the shell knows about. A union rather than `string` so a typo in
 * `activeNav` or a route lookup is a compile error instead of a
 * silently dead nav item. */
export type NavId = "about" | "learning" | "planning" | "vulnerability" | "settings";

type NavDefinition = NavItem & {
  id: NavId;
  href: string;
  /** A module the destination needs read access to somewhere. Omitted means
   * anyone signed in. */
  requiredModule?: Module;
  /** Destinations that bounce an account with no grant straight to /explore
   * (see `signedInHomePath`), so offering them is a dead end. */
  requiresGeographyScope?: boolean;
  /** Platform admins may open it without a grant: the seeded `admin` sets
   * CHART up and invites people from Settings. */
  openToAdmins?: boolean;
  /** Kept out of the sidebar for now; the route, its guard and highlighting
   * still work, so the page opens from links and its own URL. */
  hiddenFromSidebar?: boolean;
};

// One table, not two. The label/icon list and the id → route map used to be
// separate declarations, so an id could exist in one and not the other and the
// nav item would simply do nothing when clicked.
const NAV: readonly NavDefinition[] = [
  // What CHART is: the public landing page.
  { id: "about", label: "About CHART", icon: "info-circle", href: "/" },
  { id: "learning", label: "Learning hub", icon: "book", href: "/learning" },
  {
    id: "planning",
    label: "Planning center",
    icon: "users",
    href: "/plan",
    requiresGeographyScope: true,
  },
  {
    id: "vulnerability",
    label: "Vulnerability",
    icon: "alert-triangle",
    href: "/vulnerability",
    requiredModule: "vra",
    requiresGeographyScope: true,
    // Not in the sidebar for now; remove this line to bring it back.
    hiddenFromSidebar: true,
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    href: "/settings",
    // Every member reads settings; each tab and card asks for its own
    // capability.
    requiresGeographyScope: true,
    openToAdmins: true,
  },
] as const;

/** The signed-in person's access, from the session. */
export type NavUser = AccessHolder & { geographyScopes: readonly string[] };

/** The sidebar: entries whose module the person reads somewhere. Missing
 * grants are left to the route guard, which sends them to /explore. */
export function appNavFor(user: AccessHolder): NavItem[] {
  return NAV.filter(
    (item) =>
      !item.hiddenFromSidebar &&
      !(item.requiredModule && !can(user, item.requiredModule, "read")),
  ).map(
    ({
      requiredModule,
      requiresGeographyScope,
      openToAdmins,
      hiddenFromSidebar,
      ...item
    }) => item,
  );
}

/**
 * Which nav entry a path belongs to. The dashboard and its run detail pages
 * live under /dashboard but are reached from "Planning center", so they have to
 * map back to that entry or the sidebar highlights nothing while a user is
 * deep in the product.
 */
export function activeNavForPath(pathname: string | null): NavId | null {
  if (!pathname) return null;
  if (pathname === "/") return "about";
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
 * cannot disagree: no grant means /explore, a missing capability falls
 * back to planning.
 */
export function redirectForPath(pathname: string | null, user: NavUser): string | null {
  const entry = NAV.find((item) => item.id === activeNavForPath(pathname));
  if (!entry) return null;
  if (
    needsScope(entry, user) &&
    (!hasAccess(user) || user.geographyScopes.length === 0)
  ) {
    return "/explore";
  }
  if (entry.requiredModule && !can(user, entry.requiredModule, "read")) return "/plan";
  return null;
}

function needsScope(entry: NavDefinition, user: AccessHolder) {
  return (
    !!entry.requiresGeographyScope && !(entry.openToAdmins && user.isPlatformAdmin)
  );
}
