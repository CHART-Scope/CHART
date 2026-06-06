CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text,
	"auth_mode" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_kind_check" CHECK ("data_sources"."kind" in ('climate', 'health', 'population', 'geography', 'solutions'))
);
--> statement-breakpoint
CREATE TABLE "external_geography_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"external_id" text NOT NULL,
	"external_code" text,
	"external_name" text,
	"external_path" text,
	"external_level" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_geography_mappings" ADD CONSTRAINT "external_geography_mappings_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_geography_mappings" ADD CONSTRAINT "external_geography_mappings_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_sources_kind_idx" ON "data_sources" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "external_geography_mappings_source_external_unique" ON "external_geography_mappings" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_geography_mappings_source_geo_unique" ON "external_geography_mappings" USING btree ("source_id","geography_id");--> statement-breakpoint
CREATE INDEX "external_geography_mappings_geo_idx" ON "external_geography_mappings" USING btree ("geography_id");