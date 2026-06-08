import { randomUUID } from "node:crypto";

import { count, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client.js";
import {
  chartSetup,
  countryGeoConfig,
  geographies,
  hazards,
  workspaceSolutionRecords,
  workspaceGeographyScopes,
  workspaceHazards,
  workspaceMembers,
  workspaces,
} from "../../db/schema.js";
import type { CurrentUserContext } from "../auth/types.js";
import { persistUserProjection } from "../users/service.js";
import {
  prepareWorkspaceSolutionImport,
  replaceWorkspaceSolutions,
  summarizeWorkspaceSolutionImport,
} from "../workspace-solutions/service.js";
import { SetupError } from "./errors.js";
import { createBootstrapAdminUser } from "./keycloakAdmin.js";
import type {
  BootstrapSetupInput,
  BootstrapSetupResult,
  CompleteSetupInput,
  SetupOptions,
  SetupStatus,
} from "./types.js";

const setupId = "default";

export interface SetupService {
  getStatus(): Promise<SetupStatus>;
  getOptions(): Promise<SetupOptions>;
  bootstrapSetup(input: BootstrapSetupInput): Promise<BootstrapSetupResult>;
  completeSetup(
    input: CompleteSetupInput,
    context: CurrentUserContext,
  ): Promise<SetupStatus>;
  resetSetup(context: CurrentUserContext): Promise<SetupStatus>;
}

export function createSetupService(): SetupService {
  return {
    async getStatus() {
      return readSetupStatus();
    },

    async getOptions() {
      const hazardRows = await db
        .select({
          id: hazards.id,
          label: hazards.label,
        })
        .from(hazards)
        .where(eq(hazards.active, true));

      return {
        hazards: hazardRows.sort((first, second) =>
          first.label.localeCompare(second.label),
        ),
      };
    },

    async bootstrapSetup(input) {
      const setupStatus = await readSetupStatus();

      if (!setupStatus.requiresOnboarding || setupStatus.counts.workspaceMembers > 0) {
        throw new SetupError("SETUP_BOOTSTRAP_LOCKED", 409);
      }

      const setupInput = normalizeSetupInput(input);
      const adminInput = normalizeAdminInput(input.admin);
      const countrySlug = normalizeSlug(setupInput.countryName);
      const groupPath = `/${countrySlug}`;
      const adminUser = await createBootstrapAdminUser({
        ...adminInput,
        groupPath,
      });
      const nextSetupStatus = await completeSetupForContext(setupInput, {
        userId: adminUser.userId,
        username: adminUser.username,
        email: adminUser.email,
        roles: ["chart_admin", "content_editor"],
        geographyScopes: [groupPath],
        activeGeographyId: groupPath,
        geographyLevel: "country",
      });

      return {
        setup: nextSetupStatus,
        admin: adminUser,
      };
    },

    async completeSetup(input, context) {
      assertSetupAdmin(context);

      return completeSetupForContext(normalizeSetupInput(input), context);
    },

    async resetSetup(context) {
      assertSetupAdmin(context);

      await db.transaction(async (tx) => {
        const setupRows = await tx
          .select()
          .from(chartSetup)
          .where(eq(chartSetup.id, setupId))
          .limit(1);
        const setup = setupRows[0];

        if (setup?.workspaceId) {
          await tx.delete(workspaces).where(eq(workspaces.id, setup.workspaceId));
        } else {
          await tx.delete(workspaces);
        }

        if (setup?.countryCode) {
          await tx
            .delete(countryGeoConfig)
            .where(eq(countryGeoConfig.countryCode, setup.countryCode));
          await tx
            .delete(geographies)
            .where(eq(geographies.countryCode, setup.countryCode));
        } else if (setup?.rootGeographyId) {
          await tx.delete(geographies).where(eq(geographies.id, setup.rootGeographyId));
        }

        await tx
          .insert(chartSetup)
          .values({
            id: setupId,
            completed: false,
            hazards: [],
          })
          .onConflictDoUpdate({
            target: chartSetup.id,
            set: {
              completed: false,
              countryCode: null,
              countryName: null,
              geographyLevelLabel: null,
              rootGeographyId: null,
              workspaceId: null,
              firstAdminUserId: null,
              firstAdminEmail: null,
              hazards: [],
              updatedAt: sql`now()`,
            },
          });
      });

      return readSetupStatus();
    },
  };
}

async function completeSetupForContext(
  input: CompleteSetupInput,
  context: CurrentUserContext,
) {
  const countryCode = input.countryCode.trim().toUpperCase();
  const countryName = input.countryName.trim();
  const geographyLevelLabel = input.geographyLevelLabel.trim();
  const hazardIds = uniqueValues(input.hazardIds);

  if (!countryCode || !countryName || !geographyLevelLabel) {
    throw new SetupError("SETUP_COUNTRY_REQUIRED", 400);
  }

  if (hazardIds.length === 0) {
    throw new SetupError("SETUP_HAZARD_REQUIRED", 400);
  }

  const hazardRows = await findHazards(hazardIds);

  if (hazardRows.length !== hazardIds.length) {
    throw new SetupError("SETUP_HAZARD_INVALID", 400);
  }

  const solutionImport = await prepareSolutionImport(hazardIds);
  const existingSetup = await readStoredSetup();
  const countrySlug = normalizeSlug(countryName);
  const rootGeographyId = `geo-${countryCode.toLowerCase()}`;
  const workspaceId = existingSetup?.workspaceId ?? `workspace-${randomUUID()}`;

  await db.transaction(async (tx) => {
    await tx
      .insert(countryGeoConfig)
      .values([
        {
          countryCode,
          levelKey: "country",
          levelLabel: "country",
          sortOrder: 0,
        },
        {
          countryCode,
          levelKey: "geo_level_1",
          levelLabel: geographyLevelLabel,
          sortOrder: 10,
        },
      ])
      .onConflictDoUpdate({
        target: [countryGeoConfig.countryCode, countryGeoConfig.levelKey],
        set: {
          levelLabel: sql`excluded.level_label`,
          enabled: sql`excluded.enabled`,
          sortOrder: sql`excluded.sort_order`,
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(geographies)
      .values({
        id: rootGeographyId,
        countryCode,
        level: "country",
        levelLabel: "country",
        name: countryName,
        path: `/${countrySlug}`,
        sortOrder: 0,
      })
      .onConflictDoUpdate({
        target: geographies.id,
        set: {
          countryCode: sql`excluded.country_code`,
          level: sql`excluded.level`,
          levelLabel: sql`excluded.level_label`,
          name: sql`excluded.name`,
          path: sql`excluded.path`,
          sortOrder: sql`excluded.sort_order`,
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: `${countryName} CHART setup`,
        planningCycle: new Date().getUTCFullYear().toString(),
        status: "active",
        createdByUserId: context.userId,
        ownerUserId: context.userId,
        ownerGeographyId: rootGeographyId,
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: {
          name: sql`excluded.name`,
          planningCycle: sql`excluded.planning_cycle`,
          status: sql`excluded.status`,
          ownerUserId: sql`excluded.owner_user_id`,
          ownerGeographyId: sql`excluded.owner_geography_id`,
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(workspaceMembers)
      .values({
        id: `member-${randomUUID()}`,
        workspaceId,
        userId: context.userId,
        role: "owner",
      })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: {
          role: sql`excluded.role`,
        },
      });

    await tx
      .insert(workspaceGeographyScopes)
      .values({
        id: `workspace-geo-${randomUUID()}`,
        workspaceId,
        geographyId: rootGeographyId,
      })
      .onConflictDoNothing();

    await tx
      .delete(workspaceHazards)
      .where(eq(workspaceHazards.workspaceId, workspaceId));

    await tx.insert(workspaceHazards).values(
      hazardIds.map((hazardId, index) => ({
        workspaceId,
        hazardId,
        sortOrder: index,
      })),
    );

    await replaceWorkspaceSolutions(tx, workspaceId, solutionImport);

    await tx
      .insert(chartSetup)
      .values({
        id: setupId,
        completed: true,
        countryCode,
        countryName,
        geographyLevelLabel,
        rootGeographyId,
        workspaceId,
        firstAdminUserId: context.userId,
        firstAdminEmail: context.email,
        hazards: hazardRows.map((row) => ({
          hazardId: row.id,
          label: row.label,
        })),
      })
      .onConflictDoUpdate({
        target: chartSetup.id,
        set: {
          completed: true,
          countryCode: sql`excluded.country_code`,
          countryName: sql`excluded.country_name`,
          geographyLevelLabel: sql`excluded.geography_level_label`,
          rootGeographyId: sql`excluded.root_geography_id`,
          workspaceId: sql`excluded.workspace_id`,
          firstAdminUserId: sql`excluded.first_admin_user_id`,
          firstAdminEmail: sql`excluded.first_admin_email`,
          hazards: sql`excluded.hazards`,
          updatedAt: sql`now()`,
        },
      });
  });

  const rootGeographyRows = await db
    .select()
    .from(geographies)
    .where(eq(geographies.id, rootGeographyId))
    .limit(1);

  await persistUserProjection({
    userId: context.userId,
    username: context.username,
    email: context.email,
    displayName: context.username,
    roles: context.roles,
    geographies: rootGeographyRows,
    source: "onboarding",
  });

  return readSetupStatus();
}

async function readSetupStatus(): Promise<SetupStatus> {
  const [setupRows, geographyCount, hazardCount, memberCount, solutionCount] =
    await Promise.all([
      db.select().from(chartSetup).where(eq(chartSetup.id, setupId)).limit(1),
      readGeographyCount(),
      readHazardCount(),
      readWorkspaceMemberCount(),
      readWorkspaceSolutionCount(),
    ]);
  const setup = setupRows[0];
  const counts = {
    geographies: geographyCount,
    hazards: hazardCount,
    workspaceMembers: memberCount,
    workspaceSolutions: solutionCount,
  };
  const completed = Boolean(setup?.completed);
  const hasRequiredData =
    counts.geographies > 0 && counts.hazards > 0 && counts.workspaceMembers > 0;
  const solutionImport = summarizeWorkspaceSolutionImport(
    readSetupHazardIds(setup?.hazards ?? []),
    solutionCount,
  );

  return {
    completed: completed && hasRequiredData,
    requiresOnboarding: !completed || !hasRequiredData,
    countryCode: setup?.countryCode ?? undefined,
    countryName: setup?.countryName ?? undefined,
    rootGeographyId: setup?.rootGeographyId ?? undefined,
    workspaceId: setup?.workspaceId ?? undefined,
    firstAdminUserId: setup?.firstAdminUserId ?? undefined,
    counts,
    solutionImport,
  };
}

async function readStoredSetup() {
  const rows = await db
    .select()
    .from(chartSetup)
    .where(eq(chartSetup.id, setupId))
    .limit(1);

  return rows[0];
}

async function readGeographyCount() {
  const rows = await db.select({ total: count() }).from(geographies);

  return Number(rows[0]?.total ?? 0);
}

async function readHazardCount() {
  const rows = await db.select({ total: count() }).from(hazards);

  return Number(rows[0]?.total ?? 0);
}

async function readWorkspaceMemberCount() {
  const rows = await db.select({ total: count() }).from(workspaceMembers);

  return Number(rows[0]?.total ?? 0);
}

async function readWorkspaceSolutionCount() {
  const rows = await db.select({ total: count() }).from(workspaceSolutionRecords);

  return Number(rows[0]?.total ?? 0);
}

async function findHazards(hazardIds: string[]) {
  return db
    .select({
      id: hazards.id,
      label: hazards.label,
    })
    .from(hazards)
    .where(inArray(hazards.id, hazardIds));
}

async function prepareSolutionImport(hazardIds: string[]) {
  try {
    return await prepareWorkspaceSolutionImport(hazardIds);
  } catch {
    throw new SetupError("SETUP_SOLUTION_IMPORT_FAILED", 502);
  }
}

function assertSetupAdmin(context: CurrentUserContext) {
  if (!context.roles.includes("chart_admin")) {
    throw new SetupError("SETUP_FORBIDDEN", 403);
  }
}

function normalizeSetupInput(input: CompleteSetupInput): CompleteSetupInput {
  return {
    countryCode: input.countryCode.trim().toUpperCase(),
    countryName: input.countryName.trim(),
    geographyLevelLabel: input.geographyLevelLabel.trim(),
    hazardIds: uniqueValues(input.hazardIds),
  };
}

function normalizeAdminInput(input: BootstrapSetupInput["admin"]) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();
  const password = input.password;

  if (!name || !email || !username) {
    throw new SetupError("SETUP_ADMIN_REQUIRED", 400);
  }

  if (password.length < 8) {
    throw new SetupError("SETUP_ADMIN_PASSWORD_REQUIRED", 400);
  }

  return { name, email, username, password };
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readSetupHazardIds(
  setupHazards: {
    hazardId?: string;
    taxonomyId?: string;
  }[],
) {
  return setupHazards
    .map((hazard) => hazard.hazardId ?? hazard.taxonomyId)
    .filter((hazardId): hazardId is string => Boolean(hazardId));
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
