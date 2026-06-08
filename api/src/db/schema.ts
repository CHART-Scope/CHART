import { sql, type SQLWrapper } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  boolean,
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
const chartRoleValues = [
  "chart_admin",
  "content_editor",
  "health_planning_lead",
  "cross_sector_planning_lead",
  "health_implementation_officer",
  "cross_sector_implementation_officer",
  "public_viewer",
] as const;
const chartUserStatusValues = ["active", "disabled"] as const;
const dataSourceKindValues = [
  "climate",
  "health",
  "population",
  "geography",
  "solutions",
] as const;

export type GeographyLevelValue = (typeof geographyLevelValues)[number];
export type WorkspaceStatusValue = (typeof workspaceStatusValues)[number];
export type WorkspaceMemberRoleValue = (typeof workspaceMemberRoleValues)[number];
export type ChartRoleValue = (typeof chartRoleValues)[number];
export type ChartUserStatusValue = (typeof chartUserStatusValues)[number];
export type DataSourceKindValue = (typeof dataSourceKindValues)[number];

type ChartSetupHazard = {
  hazardId: string;
  label: string;
};

export type WorkspaceSolutionTaxonomy = {
  id: string;
  type: string;
  label: string;
};

export type WorkspaceSolutionLink = {
  label: string;
  url: string;
};

export type WorkspaceSolutionAsset = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string | null;
  attribution: string | null;
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

function chartRole(columnName: string) {
  return text(columnName).$type<ChartRoleValue>();
}

function chartUserStatus(columnName: string) {
  return text(columnName).$type<ChartUserStatusValue>();
}

function dataSourceKind(columnName: string) {
  return text(columnName).$type<DataSourceKindValue>();
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

function chartRoleCheck(column: SQLWrapper) {
  return sql`${column} in ('chart_admin', 'content_editor', 'health_planning_lead', 'cross_sector_planning_lead', 'health_implementation_officer', 'cross_sector_implementation_officer', 'public_viewer')`;
}

function chartUserStatusCheck(column: SQLWrapper) {
  return sql`${column} in ('active', 'disabled')`;
}

function dataSourceKindCheck(column: SQLWrapper) {
  return sql`${column} in ('climate', 'health', 'population', 'geography', 'solutions')`;
}

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}

export const dataSources = pgTable(
  "data_sources",
  {
    id: text("id").primaryKey(),
    kind: dataSourceKind("kind").notNull(),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    authMode: text("auth_mode"),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("data_sources_kind_idx").on(table.kind),
    check("data_sources_kind_check", dataSourceKindCheck(table.kind)),
  ],
);

export const hazards = pgTable(
  "hazards",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    description: text("description"),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("hazards_label_unique").on(table.label),
    index("hazards_active_sort_idx").on(table.active, table.sortOrder),
  ],
);

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

export const geographyBoundaries = pgTable(
  "geography_boundaries",
  {
    id: text("id").primaryKey(),
    geographyId: text("geography_id")
      .notNull()
      .references(() => geographies.id, { onDelete: "cascade" }),
    boundaryType: text("boundary_type").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    storageUrl: text("storage_url"),
    attribution: text("attribution"),
    ...timestamps(),
  },
  (table) => [
    index("geography_boundaries_geography_idx").on(table.geographyId),
    uniqueIndex("geography_boundaries_geography_type_unique").on(
      table.geographyId,
      table.boundaryType,
    ),
  ],
);

export const externalGeographyMappings = pgTable(
  "external_geography_mappings",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    geographyId: text("geography_id")
      .notNull()
      .references(() => geographies.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    externalCode: text("external_code"),
    externalName: text("external_name"),
    externalPath: text("external_path"),
    externalLevel: text("external_level"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("external_geography_mappings_source_external_unique").on(
      table.sourceId,
      table.externalId,
    ),
    uniqueIndex("external_geography_mappings_source_geo_unique").on(
      table.sourceId,
      table.geographyId,
    ),
    index("external_geography_mappings_geo_idx").on(table.geographyId),
  ],
);

export const chartUsers = pgTable(
  "chart_users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    email: text("email"),
    displayName: text("display_name").notNull(),
    status: chartUserStatus("status").default("active").notNull(),
    identityProvider: text("identity_provider").default("keycloak").notNull(),
    createdByUserId: text("created_by_user_id"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("chart_users_username_unique").on(table.username),
    uniqueIndex("chart_users_email_unique").on(table.email),
    index("chart_users_status_idx").on(table.status),
    check("chart_users_status_check", chartUserStatusCheck(table.status)),
  ],
);

export const chartUserRoles = pgTable(
  "chart_user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => chartUsers.id, { onDelete: "cascade" }),
    role: chartRole("role").notNull(),
    source: text("source").default("keycloak").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    index("chart_user_roles_role_idx").on(table.role),
    check("chart_user_roles_role_check", chartRoleCheck(table.role)),
  ],
);

export const userGeographyScopes = pgTable(
  "user_geography_scopes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
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

export const chartSetup = pgTable("chart_setup", {
  id: text("id").primaryKey(),
  completed: boolean("completed").default(false).notNull(),
  countryCode: text("country_code"),
  countryName: text("country_name"),
  geographyLevelLabel: text("geography_level_label"),
  rootGeographyId: text("root_geography_id").references(() => geographies.id, {
    onDelete: "set null",
  }),
  workspaceId: text("workspace_id"),
  firstAdminUserId: text("first_admin_user_id"),
  firstAdminEmail: text("first_admin_email"),
  hazards: jsonb("hazards").$type<ChartSetupHazard[]>().default([]).notNull(),
  ...timestamps(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    planningCycle: text("planning_cycle"),
    status: workspaceStatus("status").default("active").notNull(),
    createdByUserId: text("created_by_user_id"),
    ownerUserId: text("owner_user_id"),
    ownerGeographyId: text("owner_geography_id").references(() => geographies.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("workspaces_owner_geography_idx").on(table.ownerGeographyId),
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
    userId: text("user_id").notNull(),
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

export const workspaceGeographyScopes = pgTable(
  "workspace_geography_scopes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    geographyId: text("geography_id")
      .notNull()
      .references(() => geographies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_geography_scopes_workspace_geo_unique").on(
      table.workspaceId,
      table.geographyId,
    ),
    index("workspace_geography_scopes_geo_idx").on(table.geographyId),
  ],
);

export const workspaceHazards = pgTable(
  "workspace_hazards",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hazardId: text("hazard_id")
      .notNull()
      .references(() => hazards.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.hazardId],
    }),
    index("workspace_hazards_hazard_idx").on(table.hazardId),
  ],
);

export const workspaceSolutionRecords = pgTable(
  "workspace_solution_records",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    sourceRecordId: text("source_record_id"),
    sourceVersion: text("source_version"),
    sourceUpdatedAt: text("source_updated_at"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    costOfImplementation: text("cost_of_implementation"),
    status: text("status").default("published").notNull(),
    license: text("license"),
    attribution: text("attribution"),
    taxonomies: jsonb("taxonomies")
      .$type<WorkspaceSolutionTaxonomy[]>()
      .default([])
      .notNull(),
    links: jsonb("links").$type<WorkspaceSolutionLink[]>().default([]).notNull(),
    assets: jsonb("assets").$type<WorkspaceSolutionAsset[]>().default([]).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("workspace_solution_records_workspace_source_slug_unique").on(
      table.workspaceId,
      table.sourceId,
      table.slug,
    ),
    index("workspace_solution_records_workspace_idx").on(table.workspaceId),
    index("workspace_solution_records_source_idx").on(table.sourceId, table.slug),
    index("workspace_solution_records_status_idx").on(table.status),
  ],
);

export const workspaceSolutionHazards = pgTable(
  "workspace_solution_hazards",
  {
    workspaceId: text("workspace_id").notNull(),
    solutionRecordId: text("solution_record_id").notNull(),
    hazardId: text("hazard_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "workspace_solution_hazards_pk",
      columns: [table.workspaceId, table.solutionRecordId, table.hazardId],
    }),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
      name: "workspace_solution_hazards_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.solutionRecordId],
      foreignColumns: [workspaceSolutionRecords.id],
      name: "workspace_solution_hazards_record_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.hazardId],
      foreignColumns: [hazards.id],
      name: "workspace_solution_hazards_hazard_fk",
    }).onDelete("restrict"),
    index("workspace_solution_hazards_workspace_idx").on(table.workspaceId),
    index("workspace_solution_hazards_hazard_idx").on(table.hazardId),
  ],
);
