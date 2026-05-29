import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const geographyLevel = pgEnum("geography_level", [
  "country",
  "geo_level_1",
  "geo_level_2",
  "geo_level_3",
]);

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

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    planningCycle: text("planning_cycle"),
    status: text("status").default("active").notNull(),
    ownerGeographyId: text("owner_geography_id").references(() => geographies.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [index("workspaces_owner_geography_idx").on(table.ownerGeographyId)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_user_idx").on(table.userId),
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

// Airtable multi-select values can change, so repository facets stay data-driven.
export const solutionRepositoryItems = pgTable(
  "solution_repository_items",
  {
    id: text("id").primaryKey(),
    airtableRecordId: text("airtable_record_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    implementationNotes: text("implementation_notes"),
    costOfImplementation: text("cost_of_implementation"),
    maintenanceRequirement: text("maintenance_requirement"),
    timeToImplement: text("time_to_implement"),
    evidenceLevel: text("evidence_level"),
    status: text("status").default("imported").notNull(),
    sourceUrl: text("source_url"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    rawFields: jsonb("raw_fields")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("solution_repository_items_slug_unique").on(table.slug),
    uniqueIndex("solution_repository_items_airtable_record_unique").on(
      table.airtableRecordId,
    ),
    index("solution_repository_items_status_idx").on(table.status),
  ],
);

export const solutionRepositoryTaxonomies = pgTable(
  "solution_repository_taxonomies",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    label: text("label").notNull(),
    source: text("source").default("airtable").notNull(),
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
    sourceField: text("source_field"),
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
    airtableAttachmentId: text("airtable_attachment_id"),
    kind: text("kind").default("document").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    temporarySourceUrl: text("temporary_source_url"),
    storageUrl: text("storage_url"),
    attribution: text("attribution"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("solution_repository_assets_solution_idx").on(table.solutionId),
    uniqueIndex("solution_repository_assets_airtable_attachment_unique").on(
      table.airtableAttachmentId,
    ),
  ],
);
