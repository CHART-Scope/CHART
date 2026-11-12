import type { Route } from "@playwright/test";

import { ROLES, type RoleKey } from "./access";

/**
 * An in-memory stand-in for the workspace endpoints (Settings > People,
 * Departments, Roles, Workspaces), so specs exercise the browser against a
 * stateful service. The rules themselves - who may grant what, invitation
 * acceptance, department ownership - are enforced and tested end to end in
 * core/tests/test_workspaces_api.py; this keeps their shapes and the
 * refusals the browser must explain.
 */

type Grant = { role_id: number; geography_id: string };
type MemberRow = {
  user_id: string;
  display_name: string;
  email: string;
  status: "active" | "disabled";
  grants: Grant[];
  departments: number[];
};
type InvitationRow = {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  grants: Grant[];
  departments: number[];
};
type DepartmentRow = {
  id: number;
  name: string;
  archived: boolean;
  owns: { kind: string; key: string }[];
};

const PLACES: Record<string, { name: string; path: string }> = {
  "geo-in": { name: "India", path: "/india" },
  "geo-in-mp": { name: "Madhya Pradesh", path: "/india/madhya-pradesh" },
  "geo-in-mp-bhopal": { name: "Bhopal Division", path: "/india/madhya-pradesh/bhopal" },
  "geo-in-mp-gwalior": {
    name: "Gwalior Division",
    path: "/india/madhya-pradesh/gwalior",
  },
};
const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export type WorkspaceState = {
  workspaces: { id: string; country_code: string; name: string; place_path: string }[];
  members: MemberRow[];
  invitations: InvitationRow[];
  departments: DepartmentRow[];
  mine: number[];
  /** Whether the viewer may manage the members listed (the API decides per
   * member from people manage over their places). */
  canManage: boolean;
  /** Requests that changed something, as "METHOD /path". */
  writes: string[];
};

export function workspaceState(): WorkspaceState {
  return {
    workspaces: [
      { id: "workspace-in", country_code: "IN", name: "India", place_path: "/india" },
    ],
    members: [
      {
        user_id: "priya",
        display_name: "Priya Sharma",
        email: "priya@example.org",
        status: "active",
        grants: [{ role_id: 2, geography_id: "geo-in-mp" }],
        departments: [1],
      },
      {
        user_id: "ravi",
        display_name: "Ravi Patel",
        email: "ravi@example.org",
        status: "active",
        grants: [{ role_id: 5, geography_id: "geo-in-mp-bhopal" }],
        departments: [2],
      },
    ],
    invitations: [],
    departments: ["Health", "Water", "Labour"].map((name, index) => ({
      id: index + 1,
      name,
      archived: false,
      owns: [],
    })),
    mine: [],
    canManage: true,
    writes: [],
  };
}

const roleOf = (id: number) => ROLE_KEYS[(id - 1) % ROLE_KEYS.length];

function grantItem(grant: Grant) {
  const key = roleOf(grant.role_id);
  const place = PLACES[grant.geography_id];
  return {
    role_id: grant.role_id,
    role_key: key,
    role_name: ROLES[key].name,
    geography_id: grant.geography_id,
    place_name: place?.name ?? grant.geography_id,
    place_path: place?.path ?? grant.geography_id,
  };
}

function departmentRefs(state: WorkspaceState, ids: number[]) {
  return state.departments
    .filter((item) => ids.includes(item.id))
    .map(({ id, name }) => ({ id, name }));
}

function departmentList(state: WorkspaceState) {
  return {
    items: [...state.departments]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({
        ...item,
        member_count: state.members.filter(
          (member) =>
            member.status === "active" && member.departments.includes(item.id),
        ).length,
      })),
    mine: state.mine,
  };
}

function member(state: WorkspaceState, row: MemberRow) {
  return {
    user_id: row.user_id,
    display_name: row.display_name,
    email: row.email,
    status: row.status,
    grants: row.grants.map(grantItem),
    departments: departmentRefs(state, row.departments),
    last_seen_at: null,
    can_manage: state.canManage,
  };
}

function invitation(state: WorkspaceState, row: InvitationRow) {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    grants: row.grants.map(grantItem),
    departments: departmentRefs(state, row.departments),
    invited_by: "Admin",
    expires_at: "2026-11-19T10:00:00Z",
    created_at: "2026-11-12T10:00:00Z",
    email_sent: row.status === "pending" ? true : null,
  };
}

function reply(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Answer a workspace request, or return false to let the caller go on. */
export async function answerWorkspaces(
  route: Route,
  url: URL,
  state: WorkspaceState,
): Promise<boolean> {
  const method = route.request().method();
  const path = url.pathname.replace(/^\/api\/chart/, "");
  const body = () => route.request().postDataJSON() as Record<string, unknown>;
  if (method !== "GET") state.writes.push(`${method} ${path}`);

  if (path === "/workspaces" && method === "GET") {
    await reply(route, {
      items: state.workspaces.map((item) => ({
        ...item,
        geography_id: item.country_code === "IN" ? "geo-in" : "geo-ke",
        member_count: item.id === "workspace-in" ? state.members.length : 0,
      })),
    });
    return true;
  }
  if (path === "/workspaces" && method === "POST") {
    const code = String(body().country_code).toUpperCase();
    if (state.workspaces.some((item) => item.country_code === code)) {
      await reply(route, { error: "WORKSPACE_EXISTS" }, 409);
      return true;
    }
    const created = {
      id: `workspace-${code.toLowerCase()}`,
      country_code: code,
      name: code === "KE" ? "Kenya" : code,
      place_path: code === "KE" ? "/kenya" : `/${code.toLowerCase()}`,
    };
    state.workspaces.push(created);
    await reply(
      route,
      { ...created, geography_id: `geo-${code.toLowerCase()}`, member_count: 0 },
      201,
    );
    return true;
  }
  const match = path.match(/^\/workspaces\/([^/]+)\/(.+)$/);
  if (!match) return false;
  const rest = match[2];

  if (rest === "roles") {
    await reply(route, {
      modules: [
        "risk",
        "data",
        "vra",
        "actions",
        "plans",
        "seasons",
        "people",
        "departments",
        "workspace",
      ],
      items: ROLE_KEYS.map((key, index) => ({
        id: index + 1,
        key,
        name: ROLES[key].name,
        is_default: true,
        capabilities: ROLES[key].capabilities,
      })),
    });
    return true;
  }
  if (rest === "resources") {
    await reply(route, {
      items: [
        { kind: "data_source", key: "era5", name: "ERA5 climate (Copernicus)" },
        { kind: "vra_indicator_group", key: "Demography", name: "Demography" },
        {
          kind: "vra_indicator_group",
          key: "Occupational exposure",
          name: "Occupational exposure",
        },
      ],
    });
    return true;
  }
  if (rest === "members") {
    await reply(route, { items: state.members.map((row) => member(state, row)) });
    return true;
  }
  const memberMatch = rest.match(/^members\/([^/]+)(?:\/(disable|enable))?$/);
  if (memberMatch) {
    const row = state.members.find((item) => item.user_id === memberMatch[1]);
    if (!row) {
      await reply(route, { error: "MEMBER_NOT_FOUND" }, 404);
      return true;
    }
    if (memberMatch[2])
      row.status = memberMatch[2] === "disable" ? "disabled" : "active";
    else {
      const change = body() as { grants: Grant[]; department_ids: number[] };
      row.grants = change.grants;
      row.departments = change.department_ids;
    }
    await reply(route, member(state, row));
    return true;
  }
  if (rest === "invitations" && method === "GET") {
    await reply(route, {
      items: state.invitations.map((row) => invitation(state, row)),
    });
    return true;
  }
  if (rest === "invitations" && method === "POST") {
    const request = body() as {
      email: string;
      grants: Grant[];
      department_ids: number[];
      new_departments: string[];
    };
    const email = request.email.trim().toLowerCase();
    if (
      state.invitations.some(
        (item) => item.email === email && item.status === "pending",
      )
    ) {
      await reply(route, { error: "INVITATION_PENDING" }, 409);
      return true;
    }
    const added = request.new_departments.map((name) => {
      const row = { id: state.departments.length + 1, name, archived: false, owns: [] };
      state.departments.push(row);
      return row.id;
    });
    const row: InvitationRow = {
      id: `00000000-0000-4000-8000-${String(state.invitations.length + 1).padStart(12, "0")}`,
      email,
      status: "pending",
      grants: request.grants,
      departments: [...request.department_ids, ...added],
    };
    state.invitations.push(row);
    await reply(route, invitation(state, row), 201);
    return true;
  }
  const inviteMatch = rest.match(/^invitations\/([^/]+)\/(resend|revoke)$/);
  if (inviteMatch) {
    const row = state.invitations.find((item) => item.id === inviteMatch[1]);
    if (!row) {
      await reply(route, { error: "INVITATION_NOT_FOUND" }, 404);
      return true;
    }
    row.status = inviteMatch[2] === "revoke" ? "revoked" : "pending";
    await reply(route, invitation(state, row));
    return true;
  }
  if (rest === "departments" && method === "GET") {
    await reply(route, departmentList(state));
    return true;
  }
  if (rest === "departments" && method === "POST") {
    const name = String(body().name).trim();
    if (
      state.departments.some((item) => item.name.toLowerCase() === name.toLowerCase())
    ) {
      await reply(route, { error: "DEPARTMENT_EXISTS" }, 409);
      return true;
    }
    state.departments.push({
      id: state.departments.length + 1,
      name,
      archived: false,
      owns: [],
    });
    await reply(route, departmentList(state), 201);
    return true;
  }
  if (rest === "departments/mine") {
    state.mine = (body() as { department_ids: number[] }).department_ids;
    await reply(route, departmentList(state));
    return true;
  }
  const departmentMatch = rest.match(/^departments\/(\d+)(\/ownership)?$/);
  if (departmentMatch) {
    const id = Number(departmentMatch[1]);
    const row = state.departments.find((item) => item.id === id);
    if (!row) {
      await reply(route, { error: "DEPARTMENT_NOT_FOUND" }, 404);
      return true;
    }
    if (departmentMatch[2]) {
      row.owns = (body() as { resources: { kind: string; key: string }[] }).resources;
    } else if (method === "DELETE") {
      const used =
        state.members.some((item) => item.departments.includes(id)) ||
        row.owns.length > 0;
      if (used) {
        await reply(route, { error: "DEPARTMENT_IN_USE" }, 409);
        return true;
      }
      state.departments = state.departments.filter((item) => item.id !== id);
    } else {
      const change = body() as { name?: string; archived?: boolean };
      if (change.name !== undefined) row.name = change.name.trim();
      if (change.archived !== undefined) row.archived = change.archived;
    }
    await reply(route, departmentList(state));
    return true;
  }
  return false;
}
