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
export type DataSourceKindValue = (typeof dataSourceKindValues)[number];

type AppSetupHazard = {
  taxonomyId: string;
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

export const appSetup = pgTable("app_setup", {
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
  hazards: jsonb("hazards").$type<AppSetupHazard[]>().default([]).notNull(),
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

// Repository facets stay data-driven because source options can change.
export const solutionRepositoryItems = pgTable(
  "solution_repository_items",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    implementationNotes: text("implementation_notes"),
    costOfImplementation: text("cost_of_implementation"),
    maintenanceRequirement: text("maintenance_requirement"),
    timeToImplement: text("time_to_implement"),
    evidenceLevel: text("evidence_level"),
    sourceId: text("source_id").default("chart-solution-repository").notNull(),
    sourceRecordId: text("source_record_id"),
    sourceVersion: text("source_version"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    license: text("license"),
    attribution: text("attribution"),
    status: text("status").default("imported").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("solution_repository_items_slug_unique").on(table.slug),
    uniqueIndex("solution_repository_items_source_record_unique").on(
      table.sourceId,
      table.sourceRecordId,
    ),
    index("solution_repository_items_status_idx").on(table.status),
    index("solution_repository_items_source_idx").on(table.sourceId),
  ],
);

export const solutionRepositoryTaxonomies = pgTable(
  "solution_repository_taxonomies",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    label: text("label").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("solution_repository_taxonomies_type_label_unique").on(
      table.type,
      table.label,
    ),
    index("solution_repository_taxonomies_type_idx").on(table.type),
  ],
);

export const workspaceHazards = pgTable(
  "workspace_hazards",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taxonomyId: text("taxonomy_id")
      .notNull()
      .references(() => solutionRepositoryTaxonomies.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.taxonomyId],
    }),
    index("workspace_hazards_taxonomy_idx").on(table.taxonomyId),
  ],
);

export const solutionRepositoryItemTaxonomies = pgTable(
  "solution_repository_item_taxonomies",
  {
    solutionId: text("solution_id")
      .notNull()
      .references(() => solutionRepositoryItems.id, { onDelete: "cascade" }),
    taxonomyId: text("taxonomy_id")
      .notNull()
      .references(() => solutionRepositoryTaxonomies.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.solutionId, table.taxonomyId],
    }),
    index("solution_repository_item_taxonomies_taxonomy_idx").on(table.taxonomyId),
  ],
);

export const solutionRepositoryLinks = pgTable(
  "solution_repository_links",
  {
    id: text("id").primaryKey(),
    solutionId: text("solution_id")
      .notNull()
      .references(() => solutionRepositoryItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [index("solution_repository_links_solution_idx").on(table.solutionId)],
);

export const solutionRepositoryAssets = pgTable(
  "solution_repository_assets",
  {
    id: text("id").primaryKey(),
    solutionId: text("solution_id")
      .notNull()
      .references(() => solutionRepositoryItems.id, { onDelete: "cascade" }),
    kind: text("kind").default("document").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storageUrl: text("storage_url"),
    attribution: text("attribution"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [index("solution_repository_assets_solution_idx").on(table.solutionId)],
);
