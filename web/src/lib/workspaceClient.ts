import type { Level, Module } from "@/lib/access";
import { authFetch } from "@/lib/authFetch";

/**
 * Typed client for workspaces, their roles, members, invitations and
 * departments (Settings > People, Departments, Roles, Workspaces). The
 * Python API checks every capability; error codes become sentences here.
 */

export type Workspace = {
  id: string;
  country_code: string;
  name: string;
  geography_id: string | null;
  place_path: string | null;
  member_count: number;
};

export type Role = {
  id: number;
  key: string;
  name: string;
  is_default: boolean;
  capabilities: Partial<Record<Module, Level>>;
};
export type RoleList = { modules: Module[]; items: Role[] };

export type Grant = {
  role_id: number;
  role_key: string;
  role_name: string;
  geography_id: string;
  place_name: string;
  place_path: string;
};
export type GrantInput = { role_id: number; geography_id: string };
export type DepartmentRef = { id: number; name: string };

export type Member = {
  user_id: string;
  display_name: string;
  email: string | null;
  status: "active" | "disabled";
  grants: Grant[];
  departments: DepartmentRef[];
  last_seen_at: string | null;
  can_manage: boolean;
};

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type Invitation = {
  id: string;
  email: string;
  status: InvitationStatus;
  grants: Grant[];
  departments: DepartmentRef[];
  invited_by: string | null;
  expires_at: string;
  created_at: string;
  email_sent: boolean | null;
};
export type InvitationInput = {
  email: string;
  name: string;
  grants: GrantInput[];
  department_ids: number[];
  new_departments: string[];
};

export type ResourceKind = "data_source" | "vra_indicator_group";
export type ResourceRef = { kind: ResourceKind; key: string };
export type ResourceOption = ResourceRef & { name: string };

export type Department = {
  id: number;
  name: string;
  archived: boolean;
  member_count: number;
  owns: ResourceRef[];
};
export type DepartmentList = { items: Department[]; mine: number[] };

const ERROR_MESSAGES: Record<string, string> = {
  CAPABILITY_NOT_ALLOWED: "Your role does not allow this here.",
  PLATFORM_ADMIN_REQUIRED: "Only a platform admin can do this.",
  WORKSPACE_NOT_FOUND: "This workspace is not available to you.",
  WORKSPACE_EXISTS: "That country already has a workspace.",
  COUNTRY_NOT_FOUND: "That country is not installed.",
  MEMBER_NOT_FOUND: "That person is no longer a member. Reload.",
  MEMBER_EXISTS: "That person is already a member of this workspace.",
  MEMBER_SELF_EDIT: "Ask another admin to change your own access.",
  INVITATION_PENDING: "That address already has a pending invitation.",
  INVITATION_NOT_FOUND: "That invitation no longer exists. Reload.",
  INVITATION_NOT_PENDING: "That invitation is no longer pending.",
  GRANT_EXCEEDS_YOUR_ACCESS:
    "You cannot give a role higher than your own at that place.",
  GRANT_PLACE_INVALID: "Choose a place in this workspace's country.",
  GRANT_PLACE_DUPLICATE: "Each place can have one role only.",
  GRANT_ROLE_INVALID: "That role is not part of this workspace. Reload.",
  DEPARTMENT_EXISTS: "That department is already on the list.",
  DEPARTMENT_JOIN_NOT_ALLOWED:
    "A workspace admin or planning lead adds people to departments.",
  DEPARTMENT_NAME_INVALID: "Give the department a name of 2 to 120 characters.",
  DEPARTMENT_UNKNOWN: "One of those departments is no longer available. Reload.",
  DEPARTMENT_IN_USE:
    "Departments with members or ownership can be archived, not deleted.",
  DEPARTMENT_NOT_FOUND: "That department no longer exists. Reload.",
};

async function failure(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const code = typeof body.detail === "string" ? body.detail : body.error;
    return new Error((typeof code === "string" && ERROR_MESSAGES[code]) || fallback);
  } catch {
    return new Error(fallback);
  }
}

async function call<T>(
  path: string,
  fallback: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await authFetch(`/api/chart${path}`, {
    method: init.method ?? "GET",
    cache: "no-store",
    signal: init.signal,
    ...(init.body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(init.body),
        }),
  });
  if (!response.ok) throw await failure(response, fallback);
  return (await response.json()) as T;
}

const ws = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`;

export const listWorkspaces = (signal?: AbortSignal) =>
  call<{ items: Workspace[] }>("/workspaces", "Workspaces could not load.", {
    signal,
  }).then((body) => body.items);

export const createWorkspace = (countryCode: string) =>
  call<Workspace>("/workspaces", "The workspace could not be created.", {
    method: "POST",
    body: { country_code: countryCode },
  });

export const listRoles = (workspaceId: string, signal?: AbortSignal) =>
  call<RoleList>(`${ws(workspaceId)}/roles`, "Roles could not load.", { signal });

export const listResources = (workspaceId: string, signal?: AbortSignal) =>
  call<{ items: ResourceOption[] }>(
    `${ws(workspaceId)}/resources`,
    "Data sources could not load.",
    { signal },
  ).then((body) => body.items);

export const listMembers = (workspaceId: string, signal?: AbortSignal) =>
  call<{ items: Member[] }>(`${ws(workspaceId)}/members`, "Members could not load.", {
    signal,
  }).then((body) => body.items);

export const updateMember = (
  workspaceId: string,
  userId: string,
  change: { grants: GrantInput[]; department_ids: number[] },
) =>
  call<Member>(
    `${ws(workspaceId)}/members/${encodeURIComponent(userId)}`,
    "The change could not be saved.",
    { method: "PUT", body: change },
  );

export const setMemberActive = (workspaceId: string, userId: string, active: boolean) =>
  call<Member>(
    `${ws(workspaceId)}/members/${encodeURIComponent(userId)}/${active ? "enable" : "disable"}`,
    active ? "The member could not be enabled." : "The member could not be disabled.",
    { method: "POST" },
  );

export const listInvitations = (workspaceId: string, signal?: AbortSignal) =>
  call<{ items: Invitation[] }>(
    `${ws(workspaceId)}/invitations`,
    "Invitations could not load.",
    { signal },
  ).then((body) => body.items);

export const invite = (workspaceId: string, input: InvitationInput) =>
  call<Invitation>(
    `${ws(workspaceId)}/invitations`,
    "The invitation could not be sent.",
    {
      method: "POST",
      body: input,
    },
  );

export const resendInvitation = (workspaceId: string, invitationId: string) =>
  call<Invitation>(
    `${ws(workspaceId)}/invitations/${invitationId}/resend`,
    "The invitation could not be resent.",
    { method: "POST" },
  );

export const revokeInvitation = (workspaceId: string, invitationId: string) =>
  call<Invitation>(
    `${ws(workspaceId)}/invitations/${invitationId}/revoke`,
    "The invitation could not be revoked.",
    { method: "POST" },
  );

export const listDepartments = (workspaceId: string, signal?: AbortSignal) =>
  call<DepartmentList>(
    `${ws(workspaceId)}/departments`,
    "Departments could not load.",
    {
      signal,
    },
  );

export const addDepartment = (workspaceId: string, name: string) =>
  call<DepartmentList>(
    `${ws(workspaceId)}/departments`,
    "The department could not be added.",
    {
      method: "POST",
      body: { name },
    },
  );

export const updateDepartment = (
  workspaceId: string,
  departmentId: number,
  change: { name?: string; archived?: boolean },
) =>
  call<DepartmentList>(
    `${ws(workspaceId)}/departments/${departmentId}`,
    "The department could not be changed.",
    { method: "PATCH", body: change },
  );

export const deleteDepartment = (workspaceId: string, departmentId: number) =>
  call<DepartmentList>(
    `${ws(workspaceId)}/departments/${departmentId}`,
    "The department could not be deleted.",
    { method: "DELETE" },
  );

export const setMyDepartments = (workspaceId: string, departmentIds: number[]) =>
  call<DepartmentList>(
    `${ws(workspaceId)}/departments/mine`,
    "Your departments could not be saved.",
    { method: "PUT", body: { department_ids: departmentIds } },
  );

export const setOwnership = (
  workspaceId: string,
  departmentId: number,
  resources: ResourceRef[],
) =>
  call<DepartmentList>(
    `${ws(workspaceId)}/departments/${departmentId}/ownership`,
    "Ownership could not be saved.",
    { method: "PUT", body: { resources } },
  );
