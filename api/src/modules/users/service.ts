import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client.js";
import {
  chartUserRoles,
  chartUsers,
  geographies,
  userGeographyScopes,
} from "../../db/schema.js";
import { chartRoles, type ChartRole, type CurrentUserContext } from "../auth/types.js";
import {
  disableKeycloakUser,
  upsertKeycloakUser,
  type IdentityUser,
  type IdentityUserInput,
} from "./keycloakIdentity.js";
import { UserError } from "./errors.js";
import type { ChartUserRecord, CreateChartUserInput } from "./types.js";

type UserIdentityProvider = {
  upsertUser(input: IdentityUserInput): Promise<IdentityUser>;
  disableUser(userId: string): Promise<void>;
};

type GeographyRow = typeof geographies.$inferSelect;
type ChartUserRow = typeof chartUsers.$inferSelect;

export interface UserService {
  listUsers(context: CurrentUserContext): Promise<ChartUserRecord[]>;
  createUser(
    input: CreateChartUserInput,
    context: CurrentUserContext,
  ): Promise<ChartUserRecord>;
  disableUser(userId: string, context: CurrentUserContext): Promise<ChartUserRecord>;
}

const defaultIdentityProvider: UserIdentityProvider = {
  upsertUser: upsertKeycloakUser,
  disableUser: disableKeycloakUser,
};

export function createUserService(
  identityProvider: UserIdentityProvider = defaultIdentityProvider,
): UserService {
  return {
    async listUsers(context) {
      assertCanManageUsers(context);

      return readChartUsers();
    },

    async createUser(input, context) {
      assertCanManageUsers(context);

      const normalized = normalizeCreateUserInput(input);
      const geographyRows = await findGeographiesById(normalized.geographyIds);

      if (geographyRows.length !== normalized.geographyIds.length) {
        throw new UserError("USER_GEOGRAPHY_INVALID", 400);
      }

      const identityUser = await identityProvider.upsertUser({
        name: normalized.name,
        email: normalized.email,
        username: normalized.username,
        password: normalized.password,
        roles: normalized.roles,
        groupPaths: geographyRows.map((geography) => geography.path),
      });

      await persistUserProjection({
        userId: identityUser.userId,
        username: identityUser.username,
        email: identityUser.email,
        displayName: normalized.name,
        roles: normalized.roles,
        geographies: geographyRows,
        createdByUserId: context.userId,
        source: "admin",
      });

      const created = await readChartUser(identityUser.userId);

      if (!created) {
        throw new UserError("USER_NOT_FOUND", 404);
      }

      return created;
    },

    async disableUser(userId, context) {
      assertCanManageUsers(context);

      if (userId === context.userId) {
        throw new UserError("USER_CANNOT_DISABLE_SELF", 400);
      }

      const existing = await readChartUser(userId);

      if (!existing) {
        throw new UserError("USER_NOT_FOUND", 404);
      }

      await identityProvider.disableUser(userId);

      await db
        .update(chartUsers)
        .set({
          status: "disabled",
          updatedAt: sql`now()`,
        })
        .where(eq(chartUsers.id, userId));

      return {
        ...existing,
        status: "disabled",
      };
    },
  };
}

export async function persistUserProjection(input: {
  userId: string;
  username: string;
  email?: string;
  displayName: string;
  roles: ChartRole[];
  geographies: GeographyRow[];
  createdByUserId?: string;
  source: string;
}) {
  await db.transaction(async (tx) => {
    await tx
      .insert(chartUsers)
      .values({
        id: input.userId,
        username: input.username,
        email: input.email ?? null,
        displayName: input.displayName,
        status: "active",
        createdByUserId: input.createdByUserId,
        lastSeenAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: chartUsers.id,
        set: {
          username: sql`excluded.username`,
          email: sql`excluded.email`,
          displayName: sql`excluded.display_name`,
          status: "active",
          lastSeenAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      });

    await tx.delete(chartUserRoles).where(eq(chartUserRoles.userId, input.userId));

    if (input.roles.length > 0) {
      await tx.insert(chartUserRoles).values(
        input.roles.map((role) => ({
          userId: input.userId,
          role,
          source: input.source,
          syncedAt: sql`now()`,
        })),
      );
    }

    await tx
      .delete(userGeographyScopes)
      .where(eq(userGeographyScopes.userId, input.userId));

    if (input.geographies.length > 0) {
      await tx.insert(userGeographyScopes).values(
        input.geographies.map((geography) => ({
          id: `user-geo-${randomUUID()}`,
          userId: input.userId,
          geographyId: geography.id,
          source: input.source,
          externalGroupPath: geography.path,
        })),
      );
    }
  });
}

async function readChartUsers() {
  const rows = await db.select().from(chartUsers);
  const roles = await db.select().from(chartUserRoles);
  const scopes = await readAllUserGeographyScopes();

  return rows
    .map((row) =>
      mapUserRecord(
        row,
        roles
          .filter((role) => role.userId === row.id)
          .map((role) => role.role as ChartRole),
        scopes.get(row.id) ?? [],
      ),
    )
    .sort((first, second) => first.displayName.localeCompare(second.displayName));
}

async function readChartUser(userId: string) {
  const rows = await db
    .select()
    .from(chartUsers)
    .where(eq(chartUsers.id, userId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  const roleRows = await db
    .select()
    .from(chartUserRoles)
    .where(eq(chartUserRoles.userId, userId));
  const scopes = await readAllUserGeographyScopes(userId);

  return mapUserRecord(
    row,
    roleRows.map((role) => role.role as ChartRole),
    scopes.get(userId) ?? [],
  );
}

async function readAllUserGeographyScopes(userId?: string) {
  const rows = await db
    .select({
      userId: userGeographyScopes.userId,
      geographyId: geographies.id,
      path: geographies.path,
      name: geographies.name,
      levelLabel: geographies.levelLabel,
    })
    .from(userGeographyScopes)
    .innerJoin(geographies, eq(userGeographyScopes.geographyId, geographies.id))
    .where(userId ? eq(userGeographyScopes.userId, userId) : undefined);
  const scopesByUser = new Map<string, ChartUserRecord["geographyScopes"]>();

  for (const row of rows) {
    const scopes = scopesByUser.get(row.userId) ?? [];

    scopes.push({
      geographyId: row.geographyId,
      path: row.path,
      name: row.name,
      levelLabel: row.levelLabel,
    });
    scopesByUser.set(row.userId, scopes);
  }

  return scopesByUser;
}

function mapUserRecord(
  row: ChartUserRow,
  roles: ChartRole[],
  geographyScopes: ChartUserRecord["geographyScopes"],
): ChartUserRecord {
  return {
    userId: row.id,
    username: row.username,
    email: row.email ?? undefined,
    displayName: row.displayName,
    status: row.status,
    roles,
    geographyScopes,
  };
}

async function findGeographiesById(geographyIds: string[]) {
  if (geographyIds.length === 0) {
    return [];
  }

  return db.select().from(geographies).where(inArray(geographies.id, geographyIds));
}

function normalizeCreateUserInput(input: CreateChartUserInput): CreateChartUserInput {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();
  const roles = uniqueValues(input.roles);
  const geographyIds = uniqueValues(input.geographyIds);

  if (!name) {
    throw new UserError("USER_NAME_REQUIRED", 400);
  }

  if (!email) {
    throw new UserError("USER_EMAIL_REQUIRED", 400);
  }

  if (!username) {
    throw new UserError("USER_USERNAME_REQUIRED", 400);
  }

  if (input.password.length < 8) {
    throw new UserError("USER_PASSWORD_REQUIRED", 400);
  }

  if (roles.length === 0) {
    throw new UserError("USER_ROLE_REQUIRED", 400);
  }

  if (roles.some((role) => !chartRoles.includes(role))) {
    throw new UserError("USER_ROLE_INVALID", 400);
  }

  if (geographyIds.length === 0) {
    throw new UserError("USER_GEOGRAPHY_REQUIRED", 400);
  }

  return {
    name,
    email,
    username,
    password: input.password,
    roles,
    geographyIds,
  };
}

function assertCanManageUsers(context: CurrentUserContext) {
  if (!context.roles.includes("chart_admin")) {
    throw new UserError("USER_FORBIDDEN", 403);
  }
}

function uniqueValues<T extends string>(values: T[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))] as T[];
}
