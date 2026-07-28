import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { geographies, workspaceMembers, workspaces } from "../../db/schema.js";
import { canReadGeographyPath } from "../auth/service.js";
import type { CurrentUserContext } from "../auth/types.js";
import type {
  CreateWorkspaceInput,
  WorkspaceErrorCode,
  WorkspaceRecord,
} from "./types.js";

export class WorkspaceError extends Error {
  constructor(
    public readonly code: WorkspaceErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}

export interface WorkspaceService {
  createWorkspace(
    input: CreateWorkspaceInput,
    context: CurrentUserContext,
  ): Promise<WorkspaceRecord>;
  getWorkspace(
    workspaceId: string,
    context: CurrentUserContext,
  ): Promise<WorkspaceRecord>;
}

export function createWorkspaceService(): WorkspaceService {
  return {
    async createWorkspace(input, context) {
      const name = input.name.trim();
      const geographyId = input.geographyId.trim();

      if (!name) {
        throw new WorkspaceError("WORKSPACE_NAME_REQUIRED", 400);
      }

      if (!geographyId) {
        throw new WorkspaceError("WORKSPACE_GEOGRAPHY_REQUIRED", 400);
      }

      if (!canCreateWorkspace(context)) {
        throw new WorkspaceError("WORKSPACE_CREATE_FORBIDDEN", 403);
      }

      const geography = await findGeographyById(geographyId);

      if (!geography || !canUseGeography(context, geography.path)) {
        throw new WorkspaceError("WORKSPACE_ACCESS_DENIED", 403);
      }

      const workspaceId = `workspace-${randomUUID()}`;

      await db.transaction(async (tx) => {
        await tx.insert(workspaces).values({
          id: workspaceId,
          name,
          planningCycle: input.planningCycle?.trim() || null,
          status: "active",
          geographyId,
          createdByUserId: context.userId,
          ownerUserId: context.userId,
        });

        await tx.insert(workspaceMembers).values({
          id: `member-${randomUUID()}`,
          workspaceId,
          userId: context.userId,
          role: "owner",
        });
      });

      return {
        id: workspaceId,
        name,
        planningCycle: input.planningCycle?.trim() || null,
        status: "active",
        geographyId,
        createdByUserId: context.userId,
        ownerUserId: context.userId,
        memberRole: "owner",
      };
    },

    async getWorkspace(workspaceId, context) {
      const rows = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      const workspace = rows[0];

      if (!workspace) {
        throw new WorkspaceError("WORKSPACE_NOT_FOUND", 404);
      }

      const memberRows = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, context.userId),
          ),
        )
        .limit(1);
      const member = memberRows[0];

      if (!isChartAdmin(context) && !member) {
        throw new WorkspaceError("WORKSPACE_ACCESS_DENIED", 403);
      }

      return {
        id: workspace.id,
        name: workspace.name,
        planningCycle: workspace.planningCycle,
        status: workspace.status,
        geographyId: workspace.geographyId,
        createdByUserId: workspace.createdByUserId,
        ownerUserId: workspace.ownerUserId,
        memberRole: member?.role,
      };
    },
  };
}

function canCreateWorkspace(context: CurrentUserContext) {
  return context.roles.some((role) =>
    ["health_planning_lead", "cross_sector_planning_lead", "chart_admin"].includes(
      role,
    ),
  );
}

function canUseGeography(context: CurrentUserContext, geographyPath: string) {
  return isChartAdmin(context) || canReadGeographyPath(context, geographyPath);
}

function isChartAdmin(context: CurrentUserContext) {
  return context.roles.includes("chart_admin");
}

async function findGeographyById(geographyId: string) {
  const rows = await db
    .select()
    .from(geographies)
    .where(eq(geographies.id, geographyId))
    .limit(1);

  return rows[0];
}
