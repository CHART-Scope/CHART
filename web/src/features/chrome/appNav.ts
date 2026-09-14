import type { NavItem } from "@/components/AppShell";

const BASE_NAV: readonly NavItem[] = [
  { id: "learning", label: "Learning hub", icon: "book" },
  { id: "planning", label: "Start planning", icon: "users" },
] as const;

const ADMIN_ITEM: NavItem = {
  id: "settings",
  label: "Settings",
  icon: "settings",
};

export function appNavForRoles(roles: readonly string[]): NavItem[] {
  return roles.includes("chart_admin") ? [...BASE_NAV, ADMIN_ITEM] : [...BASE_NAV];
}

export const NAV_ROUTE: Record<string, string> = {
  planning: "/plan",
  learning: "/learning",
  settings: "/settings",
};
