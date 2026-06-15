import type { ChartRole, CurrentUserContext, GeographyLevel } from "./authClient";

type UserProfile = {
  roleLabel: string;
  workspaceTitle: string;
  setupFocus: string;
  capabilities: string[];
  nextActions: string[];
};

const roleProfiles: Partial<Record<ChartRole, UserProfile>> = {
  chart_admin: {
    roleLabel: "Platform administrator",
    workspaceTitle: "Platform setup workspace",
    setupFocus:
      "Platform configuration, users, repository source, and geography readiness.",
    capabilities: [
      "Configure the published solution repository source",
      "Coordinate user onboarding and role assignments",
      "Review platform setup before country or region rollout",
    ],
    nextActions: [
      "Confirm the deployment geography and level labels",
      "Add the first health and cross-sector users",
      "Confirm the initial action repository import",
    ],
  },
  content_editor: {
    roleLabel: "Repository coordinator",
    workspaceTitle: "Repository coordination workspace",

    setupFocus: "Repository quality, useful links, and publication readiness.",
    capabilities: [
      "Review public action repository records available to this deployment",
      "Coordinate updates with the external solution repository service",
      "Check source links and case study resources before rollout",
    ],
    nextActions: [
      "Review imported action records",
      "Check case studies and useful links",
      "Request updates in the source repository when records need changes",
    ],
  },
  health_planning_lead: {
    roleLabel: "State / county health lead",
    workspaceTitle: "Health planning workspace",

    setupFocus: "Health planning geography, service priorities, and planning cycle.",
    capabilities: [
      "View summary risk for the assigned geography",
      "Review child geographies within scope",
      "Coordinate health-sector planning actions",
    ],
    nextActions: [
      "Review the highest-risk child geographies",
      "Compare priority hazards against available resources",
      "Start a health-sector planning discussion",
    ],
  },
  cross_sector_planning_lead: {
    roleLabel: "State / county cross-sector lead",
    workspaceTitle: "Cross-sector coordination workspace",

    setupFocus: "Cross-sector participants, shared evidence, and action coordination.",
    capabilities: [
      "View cross-sector planning context",
      "Review actions that require non-health departments",
      "Coordinate shared planning follow-up",
    ],
    nextActions: [
      "Identify actions that need non-health departments",
      "Review shared evidence with health leads",
      "Confirm owners for cross-sector follow-up",
    ],
  },
  health_implementation_officer: {
    roleLabel: "District / sub-county health officer",
    workspaceTitle: "District health execution workspace",

    setupFocus: "District context, facility/service readiness, and local actions.",
    capabilities: [
      "View assigned district or sub-county",
      "Review parent summary context",
      "Track local health implementation actions",
    ],
    nextActions: [
      "Review local risk drivers",
      "Compare parent summary context with local constraints",
      "Prepare implementation actions for review",
    ],
  },
  cross_sector_implementation_officer: {
    roleLabel: "District / sub-county cross-sector officer",
    workspaceTitle: "District cross-sector execution workspace",

    setupFocus: "Local cross-sector actions, responsibilities, and blockers.",
    capabilities: [
      "View assigned district or sub-county",
      "Review parent summary context",
      "Coordinate non-health implementation actions",
    ],
    nextActions: [
      "Review local non-health responsibilities",
      "Identify blockers that need escalation",
      "Coordinate local implementation follow-up",
    ],
  },
  public_viewer: {
    roleLabel: "Public visitor / partner",
    workspaceTitle: "Public CHART workspace",

    setupFocus: "Public resources and partner access.",
    capabilities: [
      "View public CHART content",
      "Browse public action repository records",
    ],
    nextActions: [
      "Browse public CHART resources",
      "Review public action repository records",
      "Request access when planning participation is needed",
    ],
  },
};

const genericProfile: UserProfile = {
  roleLabel: "CHART user",
  workspaceTitle: "CHART workspace",
  setupFocus: "Confirm access before starting planning.",
  capabilities: ["View assigned CHART workspace"],
  nextActions: ["Confirm role and geography access"],
};

export const setupRoleOptions = [
  {
    role: "health_planning_lead",
    label: "U1 health lead",
    responsibility: "Owns health planning at state, county, or equivalent level.",
  },
  {
    role: "cross_sector_planning_lead",
    label: "U2 cross-sector lead",
    responsibility:
      "Coordinates non-health sectors at state, county, or equivalent level.",
  },
  {
    role: "health_implementation_officer",
    label: "U3 district health officer",
    responsibility:
      "Supports health implementation at district, sub-county, or equivalent level.",
  },
  {
    role: "cross_sector_implementation_officer",
    label: "U4 district cross-sector officer",
    responsibility: "Supports local non-health implementation and escalation.",
  },
  {
    role: "content_editor",
    label: "Repository coordinator",
    responsibility:
      "Coordinates public solution repository updates with the external repository service.",
  },
] as const satisfies readonly {
  role: ChartRole;
  label: string;
  responsibility: string;
}[];

const contentManagerRoles = new Set<ChartRole>(["chart_admin", "content_editor"]);
const userManagerRoles = new Set<ChartRole>(["chart_admin"]);

export function getPrimaryRole(user: CurrentUserContext) {
  return user.roles[0];
}

export function getUserProfile(user: CurrentUserContext) {
  return roleProfiles[getPrimaryRole(user)] ?? genericProfile;
}

export function formatRole(role: ChartRole | undefined) {
  return role ? (roleProfiles[role]?.roleLabel ?? prettify(role)) : "CHART user";
}

export function canManageContent(user: CurrentUserContext) {
  return user.roles.some((role) => contentManagerRoles.has(role));
}

export function canManageUsers(user: CurrentUserContext) {
  return user.roles.some((role) => userManagerRoles.has(role));
}

export function formatGeographyPath(path: string | undefined) {
  if (!path) {
    return "No geography assigned";
  }

  return path
    .split("/")
    .filter(Boolean)
    .map((part) => prettify(part))
    .join(" / ");
}

export function formatGeographyLevel(level: GeographyLevel | undefined) {
  if (!level) {
    return "Not set";
  }

  if (level === "geo_level_1") {
    return "Level 1 geography";
  }

  if (level === "geo_level_2") {
    return "Level 2 geography";
  }

  if (level === "geo_level_3") {
    return "Level 3 geography";
  }

  return "Country";
}

export function userInitials(user: CurrentUserContext) {
  return user.username
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function prettify(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
