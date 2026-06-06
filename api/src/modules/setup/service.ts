import { randomUUID } from "node:crypto";

import { count, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client.js";
import {
  appSetup,
  countryGeoConfig,
  geographies,
  solutionRepositoryItems,
  solutionRepositoryTaxonomies,
  userGeographyScopes,
  workspaceGeographyScopes,
  workspaceHazards,
  workspaceMembers,
  workspaces,
} from "../../db/schema.js";
import type { CurrentUserContext } from "../auth/types.js";
import { importSolutionRepositorySeedFile } from "../solution-repository/seed.js";
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
      await importSolutionRepositorySeedFile();
      const hazardRows = await db
        .select({
          id: solutionRepositoryTaxonomies.id,
          label: solutionRepositoryTaxonomies.label,
        })
        .from(solutionRepositoryTaxonomies)
        .where(eq(solutionRepositoryTaxonomies.type, "hazard"));

      return {
        hazardTaxonomies: hazardRows.sort((first, second) =>
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
        countryCode: setupInput.countryCode,
        countryName: setupInput.countryName,
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
          .from(appSetup)
          .where(eq(appSetup.id, setupId))
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
          .insert(appSetup)
          .values({
            id: setupId,
            completed: false,
            hazards: [],
          })
          .onConflictDoUpdate({
            target: appSetup.id,
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
  const hazardTaxonomyIds = uniqueValues(input.hazardTaxonomyIds);

  if (!countryCode || !countryName || !geographyLevelLabel) {
    throw new SetupError("SETUP_COUNTRY_REQUIRED", 400);
  }

  if (hazardTaxonomyIds.length === 0) {
    throw new SetupError("SETUP_HAZARD_REQUIRED", 400);
  }

  await importSolutionRepositorySeedFile();
  const hazardRows = await findHazardTaxonomies(hazardTaxonomyIds);

  if (hazardRows.length !== hazardTaxonomyIds.length) {
    throw new SetupError("SETUP_HAZARD_INVALID", 400);
  }

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
      .insert(userGeographyScopes)
      .values({
        id: `user-geo-${randomUUID()}`,
        userId: context.userId,
        geographyId: rootGeographyId,
        source: "onboarding",
        externalGroupPath: context.geographyScopes[0],
      })
      .onConflictDoUpdate({
        target: [
          userGeographyScopes.userId,
          userGeographyScopes.geographyId,
          userGeographyScopes.source,
        ],
        set: {
          externalGroupPath: sql`excluded.external_group_path`,
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
      hazardTaxonomyIds.map((taxonomyId, index) => ({
        workspaceId,
        taxonomyId,
        sortOrder: index,
      })),
    );

    await tx
      .insert(appSetup)
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
          taxonomyId: row.id,
          label: row.label,
        })),
      })
      .onConflictDoUpdate({
        target: appSetup.id,
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

  return readSetupStatus();
}

async function readSetupStatus(): Promise<SetupStatus> {
  const [setupRows, geographyCount, repositoryCount, memberCount] = await Promise.all([
    db.select().from(appSetup).where(eq(appSetup.id, setupId)).limit(1),
    readGeographyCount(),
    readRepositoryCount(),
    readWorkspaceMemberCount(),
  ]);
  const setup = setupRows[0];
  const counts = {
    geographies: geographyCount,
    repositoryItems: repositoryCount,
    workspaceMembers: memberCount,
  };
  const completed = Boolean(setup?.completed);
  const hasRequiredData =
    counts.geographies > 0 && counts.repositoryItems > 0 && counts.workspaceMembers > 0;

  return {
    completed: completed && hasRequiredData,
    requiresOnboarding: !completed || !hasRequiredData,
    countryCode: setup?.countryCode ?? undefined,
    countryName: setup?.countryName ?? undefined,
    rootGeographyId: setup?.rootGeographyId ?? undefined,
    workspaceId: setup?.workspaceId ?? undefined,
    firstAdminUserId: setup?.firstAdminUserId ?? undefined,
    counts,
  };
}

async function readStoredSetup() {
  const rows = await db
    .select()
    .from(appSetup)
    .where(eq(appSetup.id, setupId))
    .limit(1);

  return rows[0];
}

async function readGeographyCount() {
  const rows = await db.select({ total: count() }).from(geographies);

  return Number(rows[0]?.total ?? 0);
}

async function readRepositoryCount() {
  const rows = await db.select({ total: count() }).from(solutionRepositoryItems);

  return Number(rows[0]?.total ?? 0);
}

async function readWorkspaceMemberCount() {
  const rows = await db.select({ total: count() }).from(workspaceMembers);

  return Number(rows[0]?.total ?? 0);
}

async function findHazardTaxonomies(hazardTaxonomyIds: string[]) {
  return db
    .select({
      id: solutionRepositoryTaxonomies.id,
      label: solutionRepositoryTaxonomies.label,
    })
    .from(solutionRepositoryTaxonomies)
    .where(inArray(solutionRepositoryTaxonomies.id, hazardTaxonomyIds));
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
    hazardTaxonomyIds: uniqueValues(input.hazardTaxonomyIds),
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

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
