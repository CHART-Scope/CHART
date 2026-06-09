import { sql, type SQLWrapper } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const geographyLevelValues = [
  "country",
  "geo_level_1",
  "geo_level_2",
  "geo_level_3",
] as const;

const workspaceStatusValues = ["active", "archived"] as const;
const workspaceMemberRoleValues = ["owner", "editor", "viewer"] as const;
const userRoleValues = [
  "chart_admin",
  "content_editor",
  "health_planning_lead",
  "cross_sector_planning_lead",
  "health_implementation_officer",
  "cross_sector_implementation_officer",
  "public_viewer",
] as const;
const userStatusValues = ["active", "disabled"] as const;

export type GeographyLevelValue = (typeof geographyLevelValues)[number];
export type WorkspaceStatusValue = (typeof workspaceStatusValues)[number];
export type WorkspaceMemberRoleValue = (typeof workspaceMemberRoleValues)[number];
export type UserRoleValue = (typeof userRoleValues)[number];
export type UserStatusValue = (typeof userStatusValues)[number];

export type SetupSelectedHazard = {
  id: string;
  label: string;
};

function geographyLevel(columnName: string) {
  return text(columnName).$type<GeographyLevelValue>();
}

function workspaceStatus(columnName: string) {
  return text(columnName).$type<WorkspaceStatusValue>();
}

function workspaceMemberRole(columnName: string) {
  return text(columnName).$type<WorkspaceMemberRoleValue>();
}

function userRole(columnName: string) {
  return text(columnName).$type<UserRoleValue>();
}

function userStatus(columnName: string) {
  return text(columnName).$type<UserStatusValue>();
}

function geographyLevelCheck(column: SQLWrapper) {
  return sql`${column} in ('country', 'geo_level_1', 'geo_level_2', 'geo_level_3')`;
}

function workspaceStatusCheck(column: SQLWrapper) {
  return sql`${column} in ('active', 'archived')`;
}

function workspaceMemberRoleCheck(column: SQLWrapper) {
  return sql`${column} in ('owner', 'editor', 'viewer')`;
}

function userRoleCheck(column: SQLWrapper) {
  return sql`${column} in ('chart_admin', 'content_editor', 'health_planning_lead', 'cross_sector_planning_lead', 'health_implementation_officer', 'cross_sector_implementation_officer', 'public_viewer')`;
}

function userStatusCheck(column: SQLWrapper) {
  return sql`${column} in ('active', 'disabled')`;
}

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}

export const countryGeoConfig = pgTable(
  "country_geo_config",
  {
    countryCode: text("country_code").notNull(),
    levelKey: geographyLevel("level_key").notNull(),
    levelLabel: text("level_label").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.countryCode, table.levelKey],
    }),
    check("country_geo_config_level_key_check", geographyLevelCheck(table.levelKey)),
  ],
);

export const geographies = pgTable(
  "geographies",
  {
    id: text("id").primaryKey(),
    countryCode: text("country_code").notNull(),
    level: geographyLevel("level").notNull(),
    levelLabel: text("level_label").notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    externalCode: text("external_code"),
    path: text("path").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "geographies_parent_id_geographies_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.countryCode, table.level],
      foreignColumns: [countryGeoConfig.countryCode, countryGeoConfig.levelKey],
      name: "geographies_country_level_country_geo_config_fk",
    }).onDelete("restrict"),
    uniqueIndex("geographies_path_unique").on(table.path),
    index("geographies_country_level_idx").on(
      table.countryCode,
      table.level,
      table.sortOrder,
    ),
    index("geographies_parent_idx").on(table.parentId, table.sortOrder),
    check("geographies_path_check", sql`${table.path} like '/%'`),
    check("geographies_level_check", geographyLevelCheck(table.level)),
  ],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    email: text("email"),
    phone: text("phone"),
    displayName: text("display_name").notNull(),
    status: userStatus("status").default("active").notNull(),
    identityProvider: text("identity_provider").default("keycloak").notNull(),
    createdByUserId: text("created_by_user_id"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [table.id],
      name: "users_created_by_user_id_users_id_fk",
    }).onDelete("set null"),
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_email_unique").on(table.email),
    index("users_status_idx").on(table.status),
    check("users_status_check", userStatusCheck(table.status)),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRole("role").notNull(),
    source: text("source").default("keycloak").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index("user_roles_role_idx").on(table.role),
    check("user_roles_role_check", userRoleCheck(table.role)),
  ],
);

export const userGeographyScopes = pgTable(
  "user_geography_scopes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    geographyId: text("geography_id")
      .notNull()
      .references(() => geographies.id, { onDelete: "cascade" }),
    source: text("source").default("keycloak").notNull(),
    externalGroupPath: text("external_group_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_geography_scopes_user_geo_source_unique").on(
      table.userId,
      table.geographyId,
      table.source,
    ),
    index("user_geography_scopes_user_idx").on(table.userId),
  ],
);

export const setupState = pgTable("setup_state", {
  id: text("id").primaryKey(),
  completed: boolean("completed").default(false).notNull(),
  countryCode: text("country_code"),
  countryName: text("country_name"),
  rootGeographyId: text("root_geography_id").references(() => geographies.id, {
    onDelete: "set null",
  }),
  firstAdminUserId: text("first_admin_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  firstAdminEmail: text("first_admin_email"),
  selectedHazards: jsonb("selected_hazards")
    .$type<SetupSelectedHazard[]>()
    .default([])
    .notNull(),
  ...timestamps(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    planningCycle: text("planning_cycle"),
    status: workspaceStatus("status").default("active").notNull(),
    geographyId: text("geography_id").references(() => geographies.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("workspaces_geography_idx").on(table.geographyId),
    index("workspaces_owner_user_idx").on(table.ownerUserId),
    check("workspaces_status_check", workspaceStatusCheck(table.status)),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceMemberRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_user_idx").on(table.userId),
    check("workspace_members_role_check", workspaceMemberRoleCheck(table.role)),
  ],
);
