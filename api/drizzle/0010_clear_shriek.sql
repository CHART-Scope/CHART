CREATE TABLE "setup_state" (
	"id" text PRIMARY KEY NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"country_code" text,
	"country_name" text,
	"root_geography_id" text,
	"first_admin_user_id" text,
	"first_admin_email" text,
	"selected_hazards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chart_setup" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_sources" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_geography_mappings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "geography_boundaries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hazards" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_geography_scopes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_hazards" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_solution_hazards" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_solution_records" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "chart_setup" CASCADE;--> statement-breakpoint
DROP TABLE "data_sources" CASCADE;--> statement-breakpoint
DROP TABLE "external_geography_mappings" CASCADE;--> statement-breakpoint
DROP TABLE "geography_boundaries" CASCADE;--> statement-breakpoint
DROP TABLE "hazards" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_geography_scopes" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_hazards" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_solution_hazards" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_solution_records" CASCADE;--> statement-breakpoint
ALTER TABLE "chart_user_roles" RENAME TO "user_roles";--> statement-breakpoint
ALTER TABLE "chart_users" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "workspaces" RENAME COLUMN "owner_geography_id" TO "geography_id";--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "chart_user_roles_role_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "chart_users_status_check";--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "chart_user_roles_user_id_chart_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_owner_geography_id_geographies_id_fk";
--> statement-breakpoint
DROP INDEX "chart_user_roles_role_idx";--> statement-breakpoint
DROP INDEX "chart_users_username_unique";--> statement-breakpoint
DROP INDEX "chart_users_email_unique";--> statement-breakpoint
DROP INDEX "chart_users_status_idx";--> statement-breakpoint
DROP INDEX "workspaces_owner_geography_idx";--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "chart_user_roles_user_id_role_pk";--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "setup_state" ADD CONSTRAINT "setup_state_root_geography_id_geographies_id_fk" FOREIGN KEY ("root_geography_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_state" ADD CONSTRAINT "setup_state_first_admin_user_id_users_id_fk" FOREIGN KEY ("first_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_country_level_country_geo_config_fk" FOREIGN KEY ("country_code","level") REFERENCES "public"."country_geo_config"("country_code","level_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_geography_scopes" ADD CONSTRAINT "user_geography_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspaces_geography_idx" ON "workspaces" USING btree ("geography_id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_check" CHECK ("user_roles"."role" in ('chart_admin', 'content_editor', 'health_planning_lead', 'cross_sector_planning_lead', 'health_implementation_officer', 'cross_sector_implementation_officer', 'public_viewer'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled'));