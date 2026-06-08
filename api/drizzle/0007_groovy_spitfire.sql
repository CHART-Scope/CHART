CREATE TABLE "hazards" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "hazards" ("id", "label", "sort_order") VALUES
	('hazard-storm', 'Storm', 10),
	('hazard-extreme-heat', 'Extreme heat', 20),
	('hazard-increased-temperature', 'Increased temperature', 30),
	('hazard-earthquake', 'Earthquake', 40),
	('hazard-flood', 'Flood', 50),
	('hazard-sea-level-rise', 'Sea level rise', 60),
	('hazard-cold-wave', 'Cold wave', 70),
	('hazard-drought', 'Drought', 80),
	('hazard-wildfire', 'Wildfire', 90),
	('hazard-increased-co2-levels', 'Increased CO2 levels', 100),
	('hazard-landslide', 'Landslide', 110),
	('hazard-tsunami', 'Tsunami', 120),
	('hazard-volcano', 'Volcano', 130),
	('hazard-cyclone', 'Cyclone', 140)
ON CONFLICT ("id") DO UPDATE SET
	"label" = excluded."label",
	"active" = true,
	"sort_order" = excluded."sort_order",
	"updated_at" = now();
--> statement-breakpoint
ALTER TABLE "workspace_hazards" DROP CONSTRAINT IF EXISTS "workspace_hazards_taxonomy_id_solution_repository_taxonomies_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "workspace_hazards_taxonomy_idx";
--> statement-breakpoint
ALTER TABLE "workspace_hazards" DROP CONSTRAINT IF EXISTS "workspace_hazards_workspace_id_taxonomy_id_pk";
--> statement-breakpoint
ALTER TABLE "workspace_hazards" RENAME COLUMN "taxonomy_id" TO "hazard_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "solution_repository_assets" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "solution_repository_item_taxonomies" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "solution_repository_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "solution_repository_links" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "solution_repository_taxonomies" CASCADE;
--> statement-breakpoint
ALTER TABLE "workspace_hazards" ADD CONSTRAINT "workspace_hazards_workspace_id_hazard_id_pk" PRIMARY KEY("workspace_id","hazard_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hazards_label_unique" ON "hazards" USING btree ("label");
--> statement-breakpoint
CREATE INDEX "hazards_active_sort_idx" ON "hazards" USING btree ("active","sort_order");
--> statement-breakpoint
ALTER TABLE "workspace_hazards" ADD CONSTRAINT "workspace_hazards_hazard_id_hazards_id_fk" FOREIGN KEY ("hazard_id") REFERENCES "public"."hazards"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_hazards_hazard_idx" ON "workspace_hazards" USING btree ("hazard_id");
