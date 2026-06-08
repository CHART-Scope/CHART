ALTER TABLE "app_setup" RENAME TO "chart_setup";--> statement-breakpoint
ALTER TABLE "app_user_roles" RENAME TO "chart_user_roles";--> statement-breakpoint
ALTER TABLE "app_users" RENAME TO "chart_users";--> statement-breakpoint
ALTER TABLE "chart_user_roles" DROP CONSTRAINT "app_user_roles_role_check";--> statement-breakpoint
ALTER TABLE "chart_users" DROP CONSTRAINT "app_users_status_check";--> statement-breakpoint
ALTER TABLE "chart_setup" DROP CONSTRAINT "app_setup_root_geography_id_geographies_id_fk";
--> statement-breakpoint
ALTER TABLE "chart_user_roles" DROP CONSTRAINT "app_user_roles_user_id_app_users_id_fk";
--> statement-breakpoint
DROP INDEX "app_user_roles_role_idx";--> statement-breakpoint
DROP INDEX "app_users_username_unique";--> statement-breakpoint
DROP INDEX "app_users_email_unique";--> statement-breakpoint
DROP INDEX "app_users_status_idx";--> statement-breakpoint
ALTER TABLE "chart_user_roles" DROP CONSTRAINT "app_user_roles_user_id_role_pk";--> statement-breakpoint
ALTER TABLE "chart_user_roles" ADD CONSTRAINT "chart_user_roles_user_id_role_pk" PRIMARY KEY("user_id","role");--> statement-breakpoint
ALTER TABLE "chart_setup" ADD CONSTRAINT "chart_setup_root_geography_id_geographies_id_fk" FOREIGN KEY ("root_geography_id") REFERENCES "public"."geographies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_user_roles" ADD CONSTRAINT "chart_user_roles_user_id_chart_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."chart_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_user_roles_role_idx" ON "chart_user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_users_username_unique" ON "chart_users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_users_email_unique" ON "chart_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "chart_users_status_idx" ON "chart_users" USING btree ("status");--> statement-breakpoint
ALTER TABLE "chart_user_roles" ADD CONSTRAINT "chart_user_roles_role_check" CHECK ("chart_user_roles"."role" in ('chart_admin', 'content_editor', 'health_planning_lead', 'cross_sector_planning_lead', 'health_implementation_officer', 'cross_sector_implementation_officer', 'public_viewer'));--> statement-breakpoint
ALTER TABLE "chart_users" ADD CONSTRAINT "chart_users_status_check" CHECK ("chart_users"."status" in ('active', 'disabled'));