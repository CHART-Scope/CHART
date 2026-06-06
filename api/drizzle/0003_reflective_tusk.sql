CREATE TABLE "app_setup" (
	"id" text PRIMARY KEY NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"country_code" text,
	"country_name" text,
	"geography_level_label" text,
	"root_geography_id" text,
	"workspace_id" text,
	"first_admin_user_id" text,
	"first_admin_email" text,
	"hazards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_setup" ADD CONSTRAINT "app_setup_root_geography_id_geographies_id_fk" FOREIGN KEY ("root_geography_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;