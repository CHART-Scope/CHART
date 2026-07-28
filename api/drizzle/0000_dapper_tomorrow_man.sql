CREATE TABLE "country_geo_config" (
	"country_code" text NOT NULL,
	"level_key" text NOT NULL,
	"level_label" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_geo_config_country_code_level_key_pk" PRIMARY KEY("country_code","level_key"),
	CONSTRAINT "country_geo_config_level_key_check" CHECK ("country_geo_config"."level_key" in ('country', 'geo_level_1', 'geo_level_2', 'geo_level_3'))
);
--> statement-breakpoint
CREATE TABLE "geographies" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"level" text NOT NULL,
	"level_label" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"external_code" text,
	"path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geographies_path_check" CHECK ("geographies"."path" like '/%'),
	CONSTRAINT "geographies_level_check" CHECK ("geographies"."level" in ('country', 'geo_level_1', 'geo_level_2', 'geo_level_3'))
);
--> statement-breakpoint
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
CREATE TABLE "user_geography_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"source" text DEFAULT 'keycloak' NOT NULL,
	"external_group_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"source" text DEFAULT 'keycloak' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_check" CHECK ("user_roles"."role" in ('chart_admin', 'content_editor', 'health_planning_lead', 'cross_sector_planning_lead', 'health_implementation_officer', 'cross_sector_implementation_officer', 'public_viewer'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"phone" text,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"identity_provider" text DEFAULT 'keycloak' NOT NULL,
	"created_by_user_id" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('owner', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"planning_cycle" text,
	"status" text DEFAULT 'active' NOT NULL,
	"geography_id" text,
	"created_by_user_id" text,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_status_check" CHECK ("workspaces"."status" in ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_parent_id_geographies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_country_level_country_geo_config_fk" FOREIGN KEY ("country_code","level") REFERENCES "public"."country_geo_config"("country_code","level_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_state" ADD CONSTRAINT "setup_state_root_geography_id_geographies_id_fk" FOREIGN KEY ("root_geography_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_state" ADD CONSTRAINT "setup_state_first_admin_user_id_users_id_fk" FOREIGN KEY ("first_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_geography_scopes" ADD CONSTRAINT "user_geography_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_geography_scopes" ADD CONSTRAINT "user_geography_scopes_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geographies_path_unique" ON "geographies" USING btree ("path");--> statement-breakpoint
CREATE INDEX "geographies_country_level_idx" ON "geographies" USING btree ("country_code","level","sort_order");--> statement-breakpoint
CREATE INDEX "geographies_parent_idx" ON "geographies" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "user_geography_scopes_user_geo_source_unique" ON "user_geography_scopes" USING btree ("user_id","geography_id","source");--> statement-breakpoint
CREATE INDEX "user_geography_scopes_user_idx" ON "user_geography_scopes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_unique" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspaces_geography_idx" ON "workspaces" USING btree ("geography_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_user_idx" ON "workspaces" USING btree ("owner_user_id");