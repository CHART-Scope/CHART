import type {
  WorkspaceMemberRoleValue,
  WorkspaceStatusValue,
} from "../../db/schema.js";

export interface CreateWorkspaceInput {
  name: string;
  ownerGeographyId: string;
  planningCycle?: string;
  hazardIds?: string[];
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  planningCycle: string | null;
  status: WorkspaceStatusValue;
  createdByUserId: string | null;
  ownerUserId: string | null;
  ownerGeographyId: string | null;
  memberRole?: WorkspaceMemberRoleValue;
  hazardIds: string[];
}

export type WorkspaceErrorCode =
  | "WORKSPACE_NAME_REQUIRED"
  | "WORKSPACE_GEOGRAPHY_REQUIRED"
  | "WORKSPACE_HAZARD_INVALID"
  | "WORKSPACE_CREATE_FORBIDDEN"
  | "WORKSPACE_ACCESS_DENIED"
  | "WORKSPACE_NOT_FOUND";

export interface WorkspaceErrorResponse {
  error: WorkspaceErrorCode;
}

export const createWorkspaceBodySchema = {
  type: "object",
  required: ["name", "ownerGeographyId"],
  properties: {
    name: { type: "string" },
    ownerGeographyId: { type: "string" },
    planningCycle: { type: "string" },
    hazardIds: {
      type: "array",
      items: { type: "string" },
    },
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
    "createdByUserId",
    "ownerUserId",
    "ownerGeographyId",
    "hazardIds",
  ],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    planningCycle: { type: ["string", "null"] },
    status: { type: "string", enum: ["active", "archived"] },
    createdByUserId: { type: ["string", "null"] },
    ownerUserId: { type: ["string", "null"] },
    ownerGeographyId: { type: ["string", "null"] },
    memberRole: { type: "string", enum: ["owner", "editor", "viewer"] },
    hazardIds: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

export const workspaceErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
