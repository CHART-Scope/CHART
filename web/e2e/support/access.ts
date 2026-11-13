/**
 * Who a spec signs in as, in `/auth/me`'s shape (docs/access-control.md).
 *
 * The default roles mirror `chart.access.capabilities`; the real API's rules
 * are covered end to end by core/tests/test_workspaces_api.py, these specs
 * cover what the browser shows for each.
 */

export type RoleKey =
  | "workspace_admin"
  | "planning_lead"
  | "implementation_officer"
  | "data_officer"
  | "viewer";

const MODULES = [
  "risk",
  "data",
  "vra",
  "actions",
  "plans",
  "seasons",
  "people",
  "departments",
  "workspace",
] as const;
type Level = "read" | "write" | "manage";
const READ = Object.fromEntries(
  MODULES.filter((module) => module !== "workspace").map((module) => [module, "read"]),
) as Record<string, Level>;

export const ROLES: Record<
  RoleKey,
  { name: string; capabilities: Record<string, Level> }
> = {
  workspace_admin: {
    name: "Workspace admin",
    capabilities: Object.fromEntries(MODULES.map((module) => [module, "manage"])),
  },
  planning_lead: {
    name: "Planning lead",
    capabilities: {
      ...READ,
      risk: "write",
      actions: "manage",
      plans: "write",
      people: "write",
      departments: "write",
    },
  },
  implementation_officer: {
    name: "Implementation officer",
    capabilities: { ...READ, actions: "write", plans: "write" },
  },
  data_officer: {
    name: "Data officer",
    capabilities: { ...READ, data: "write", vra: "write" },
  },
  viewer: { name: "Viewer", capabilities: { ...READ } },
};

export type Who = {
  /** The role held at each place; null holds nothing (never invited). */
  role?: RoleKey | null;
  places?: string[];
  platformAdmin?: boolean;
  departments?: { id: number; name: string }[];
  username?: string;
  userId?: string;
};

const COUNTRY_NAMES: Record<string, [string, string]> = {
  india: ["IN", "India"],
  kenya: ["KE", "Kenya"],
};

/** A `/auth/me` body for the person. */
export function meAs(who: Who = {}) {
  const role = who.role === undefined ? "planning_lead" : who.role;
  const places = role ? (who.places ?? ["/india"]) : [];
  const byCountry = new Map<string, string[]>();
  for (const place of places) {
    const country = place.split("/").filter(Boolean)[0] ?? "";
    byCountry.set(country, [...(byCountry.get(country) ?? []), place]);
  }
  const workspaces = [...byCountry].map(([country, paths]) => {
    const [code, name] = COUNTRY_NAMES[country] ?? [country.toUpperCase(), country];
    return {
      workspaceId: `workspace-${code.toLowerCase()}`,
      countryCode: code,
      name,
      grants: paths.map((path) => ({
        geographyId: path,
        placePath: path,
        placeName: path.split("/").filter(Boolean).at(-1) ?? path,
        roleKey: role,
        roleName: role ? ROLES[role].name : "",
        capabilities: role ? ROLES[role].capabilities : {},
      })),
      departments: who.departments ?? [],
    };
  });
  const scopes = places;
  return {
    userId: who.userId ?? "e2e-user",
    username: who.username ?? (who.platformAdmin ? "admin" : "planner"),
    email: `${who.username ?? "planner"}@example.org`,
    status: "active",
    isPlatformAdmin: Boolean(who.platformAdmin),
    geographyScopes: scopes,
    activeGeographyId: scopes[0],
    workspaces,
  };
}

export const planner: Who = { role: "planning_lead", places: ["/india"] };
export const platformAdmin: Who = { role: null, platformAdmin: true };
