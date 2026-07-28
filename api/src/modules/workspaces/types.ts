import type {
  WorkspaceMemberRoleValue,
  WorkspaceStatusValue,
} from "../../db/schema.js";

export interface CreateWorkspaceInput {
  name: string;
  geographyId: string;
  planningCycle?: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  planningCycle: string | null;
  status: WorkspaceStatusValue;
  geographyId: string | null;
  createdByUserId: string | null;
  ownerUserId: string | null;
  memberRole?: WorkspaceMemberRoleValue;
}

export type WorkspaceErrorCode =
  | "WORKSPACE_NAME_REQUIRED"
  | "WORKSPACE_GEOGRAPHY_REQUIRED"
  | "WORKSPACE_CREATE_FORBIDDEN"
  | "WORKSPACE_ACCESS_DENIED"
  | "WORKSPACE_NOT_FOUND";

export interface WorkspaceErrorResponse {
  error: WorkspaceErrorCode;
}

export const createWorkspaceBodySchema = {
  type: "object",
  required: ["name", "geographyId"],
  properties: {
    name: { type: "string" },
    geographyId: { type: "string" },
    planningCycle: { type: "string" },
  },
} as const;

export const workspaceParamsSchema = {
  type: "object",
  required: ["workspaceId"],
  properties: {
    workspaceId: { type: "string" },
  },
} as const;

export const workspaceRecordSchema = {
  type: "object",
  required: [
    "id",
    "name",
    "planningCycle",
    "status",
    "geographyId",
    "createdByUserId",
    "ownerUserId",
  ],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    planningCycle: { type: ["string", "null"] },
    status: { type: "string", enum: ["active", "archived"] },
    geographyId: { type: ["string", "null"] },
    createdByUserId: { type: ["string", "null"] },
    ownerUserId: { type: ["string", "null"] },
    memberRole: { type: "string", enum: ["owner", "editor", "viewer"] },
  },
} as const;

export const workspaceErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
