/**
 * What the signed-in person may do, from `/auth/me` (docs/access-control.md).
 *
 * The same rule the API applies, so screens show only what will work: a
 * grant covers its place and everything below it; places above a grant read
 * at most at read level; the higher of overlapping grants wins. The API
 * still checks every request; this only decides what to offer.
 */

export const MODULES = [
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
export type Module = (typeof MODULES)[number];
export type Level = "read" | "write" | "manage";

export const MODULE_LABELS: Record<Module, string> = {
  risk: "Risk and modelling",
  data: "Data uploads",
  vra: "Vulnerability (VRA)",
  actions: "Actions",
  plans: "Saved plans",
  seasons: "Heat seasons",
  people: "People",
  departments: "Departments",
  workspace: "Workspace settings",
};

export type AccessGrant = {
  geographyId: string;
  placePath: string;
  placeName: string;
  roleKey: string;
  roleName: string;
  capabilities: Partial<Record<Module, Level>>;
};

export type WorkspaceAccess = {
  workspaceId: string;
  countryCode: string;
  name: string;
  grants: AccessGrant[];
  departments: { id: number; name: string }[];
};

export type AccessHolder = {
  isPlatformAdmin: boolean;
  status: string;
  workspaces: WorkspaceAccess[];
};

const RANK: Record<Level, number> = { read: 0, write: 1, manage: 2 };

function normalize(path: string): string {
  return `/${path.split("/").filter(Boolean).join("/")}`;
}

function covers(scope: string, place: string): boolean {
  return scope === "/" || place === scope || place.startsWith(`${scope}/`);
}

function higher(a: Level | null, b: Level | null): Level | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** The person's level on a module at a place, or anywhere when no place. */
export function levelAt(
  user: AccessHolder,
  module: Module,
  place?: string,
): Level | null {
  if (user.status !== "active") return null;
  if (user.isPlatformAdmin) return "manage";
  const target = place === undefined ? undefined : normalize(place);
  let best: Level | null = null;
  for (const workspace of user.workspaces) {
    for (const grant of workspace.grants) {
      const level = grant.capabilities[module] ?? null;
      if (!level) continue;
      if (target === undefined || covers(grant.placePath, target)) {
        best = higher(best, level);
      } else if (covers(target, grant.placePath)) {
        best = higher(best, "read");
      }
    }
  }
  return best;
}

/** Whether the person holds `level` on `module` at `place` (anywhere when
 * no place is given). */
export function can(
  user: AccessHolder,
  module: Module,
  level: Level,
  place?: string,
): boolean {
  const held = levelAt(user, module, place);
  return held !== null && RANK[held] >= RANK[level];
}

/** The highest level on a module held anywhere in one workspace. */
export function levelInWorkspace(
  user: AccessHolder,
  workspaceId: string,
  module: Module,
): Level | null {
  if (user.isPlatformAdmin) return "manage";
  const workspace = user.workspaces.find((item) => item.workspaceId === workspaceId);
  let best: Level | null = null;
  for (const grant of workspace?.grants ?? [])
    best = higher(best, grant.capabilities[module] ?? null);
  return best;
}

/** Whether the person belongs anywhere: a grant, or the platform admin. */
export function hasAccess(user: AccessHolder): boolean {
  return (
    user.status === "active" &&
    (user.isPlatformAdmin || user.workspaces.some((item) => item.grants.length > 0))
  );
}
