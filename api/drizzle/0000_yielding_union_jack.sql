CREATE TYPE "public"."geography_level" AS ENUM('country', 'geo_level_1', 'geo_level_2', 'geo_level_3');--> statement-breakpoint
CREATE TABLE "country_geo_config" (
	"country_code" text NOT NULL,
	"level_key" "geography_level" NOT NULL,
	"level_label" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_geo_config_country_code_level_key_pk" PRIMARY KEY("country_code","level_key")
);
--> statement-breakpoint
CREATE TABLE "geographies" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"level" "geography_level" NOT NULL,
	"level_label" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"external_code" text,
	"path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geographies_path_check" CHECK ("geographies"."path" like '/%')
);
--> statement-breakpoint
CREATE TABLE "geography_boundaries" (
	"id" text PRIMARY KEY NOT NULL,
	"geography_id" text NOT NULL,
	"boundary_type" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text,
	"storage_url" text,
	"attribution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solution_repository_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"solution_id" text NOT NULL,
	"airtable_attachment_id" text,
	"kind" text DEFAULT 'document' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"temporary_source_url" text,
	"storage_url" text,
	"attribution" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solution_repository_item_taxonomies" (
	"solution_id" text NOT NULL,
	"taxonomy_id" text NOT NULL,
	CONSTRAINT "solution_repository_item_taxonomies_solution_id_taxonomy_id_pk" PRIMARY KEY("solution_id","taxonomy_id")
);
--> statement-breakpoint
CREATE TABLE "solution_repository_items" (
	"id" text PRIMARY KEY NOT NULL,
	"airtable_record_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"description" text,
	"implementation_notes" text,
	"cost_of_implementation" text,
	"maintenance_requirement" text,
	"time_to_implement" text,
	"evidence_level" text,
	"status" text DEFAULT 'imported' NOT NULL,
	"source_url" text,
	"source_updated_at" timestamp with time zone,
	"raw_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solution_repository_links" (
	"id" text PRIMARY KEY NOT NULL,
	"solution_id" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"source_field" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solution_repository_taxonomies" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"source" text DEFAULT 'airtable' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_geography_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"source" text DEFAULT 'keycloak' NOT NULL,
	"external_group_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_geography_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"planning_cycle" text,
	"status" text DEFAULT 'active' NOT NULL,
	"owner_geography_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_parent_id_geographies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geography_boundaries" ADD CONSTRAINT "geography_boundaries_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_repository_assets" ADD CONSTRAINT "solution_repository_assets_solution_id_solution_repository_items_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solution_repository_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_repository_item_taxonomies" ADD CONSTRAINT "solution_repository_item_taxonomies_solution_id_solution_repository_items_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solution_repository_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_repository_item_taxonomies" ADD CONSTRAINT "solution_repository_item_taxonomies_taxonomy_id_solution_repository_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."solution_repository_taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_repository_links" ADD CONSTRAINT "solution_repository_links_solution_id_solution_repository_items_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solution_repository_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_geography_scopes" ADD CONSTRAINT "user_geography_scopes_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_geography_scopes" ADD CONSTRAINT "workspace_geography_scopes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_geography_scopes" ADD CONSTRAINT "workspace_geography_scopes_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_geography_id_geographies_id_fk" FOREIGN KEY ("owner_geography_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geographies_path_unique" ON "geographies" USING btree ("path");--> statement-breakpoint
CREATE INDEX "geographies_country_level_idx" ON "geographies" USING btree ("country_code","level","sort_order");--> statement-breakpoint
CREATE INDEX "geographies_parent_idx" ON "geographies" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "geography_boundaries_geography_idx" ON "geography_boundaries" USING btree ("geography_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geography_boundaries_geography_type_unique" ON "geography_boundaries" USING btree ("geography_id","boundary_type");--> statement-breakpoint
CREATE INDEX "solution_repository_assets_solution_idx" ON "solution_repository_assets" USING btree ("solution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solution_repository_assets_airtable_attachment_unique" ON "solution_repository_assets" USING btree ("airtable_attachment_id");--> statement-breakpoint
CREATE INDEX "solution_repository_item_taxonomies_taxonomy_idx" ON "solution_repository_item_taxonomies" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solution_repository_items_slug_unique" ON "solution_repository_items" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "solution_repository_items_airtable_record_unique" ON "solution_repository_items" USING btree ("airtable_record_id");--> statement-breakpoint
CREATE INDEX "solution_repository_items_status_idx" ON "solution_repository_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "solution_repository_links_solution_idx" ON "solution_repository_links" USING btree ("solution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solution_repository_taxonomies_type_label_unique" ON "solution_repository_taxonomies" USING btree ("type","label");--> statement-breakpoint
CREATE INDEX "solution_repository_taxonomies_type_idx" ON "solution_repository_taxonomies" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_geography_scopes_user_geo_source_unique" ON "user_geography_scopes" USING btree ("user_id","geography_id","source");--> statement-breakpoint
CREATE INDEX "user_geography_scopes_user_idx" ON "user_geography_scopes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_geography_scopes_workspace_geo_unique" ON "workspace_geography_scopes" USING btree ("workspace_id","geography_id");--> statement-breakpoint
CREATE INDEX "workspace_geography_scopes_geo_idx" ON "workspace_geography_scopes" USING btree ("geography_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_unique" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_geography_idx" ON "workspaces" USING btree ("owner_geography_id");