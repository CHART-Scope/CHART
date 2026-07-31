import type { NavItem } from "@/components/AppShell";

/**
 * Single source of truth for the CHART sidebar so /plan, /dashboard,
 * /home, /learning, and every future page stay in sync. Admin-only
 * items are appended conditionally in :func:`appNavForRoles` so the
 * base three-item shape (Home / Planning center / Learning) is what
 * ordinary users always see.
 */
const BASE_NAV: readonly NavItem[] = [
  { id: "home", label: "Home", icon: "info-circle" },
  { id: "planning", label: "Planning center", icon: "users" },
  { id: "learning", label: "Learning", icon: "book" },
] as const;

const ADMIN_ITEM: NavItem = {
  id: "users",
  label: "People & access",
  icon: "settings",
};

export function appNavForRoles(roles: readonly string[]): NavItem[] {
  return roles.includes("chart_admin") ? [...BASE_NAV, ADMIN_ITEM] : [...BASE_NAV];
}

export const NAV_ROUTE: Record<string, string> = {
  home: "/home",
  planning: "/plan",
  learning: "/learning",
  users: "/plan",
};
