CREATE TABLE "app_user_roles" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"source" text DEFAULT 'keycloak' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "app_user_roles_role_check" CHECK ("app_user_roles"."role" in ('chart_admin', 'content_editor', 'health_planning_lead', 'cross_sector_planning_lead', 'health_implementation_officer', 'cross_sector_implementation_officer', 'public_viewer'))
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"identity_provider" text DEFAULT 'keycloak' NOT NULL,
	"created_by_user_id" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_status_check" CHECK ("app_users"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "app_user_roles" ADD CONSTRAINT "app_user_roles_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_user_roles_role_idx" ON "app_user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_username_unique" ON "app_users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_unique" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "app_users_status_idx" ON "app_users" USING btree ("status");