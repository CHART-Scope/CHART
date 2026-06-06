CREATE TABLE "workspace_hazards" (
	"workspace_id" text NOT NULL,
	"taxonomy_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_hazards_workspace_id_taxonomy_id_pk" PRIMARY KEY("workspace_id","taxonomy_id")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "workspace_hazards" ADD CONSTRAINT "workspace_hazards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_hazards" ADD CONSTRAINT "workspace_hazards_taxonomy_id_solution_repository_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."solution_repository_taxonomies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_hazards_taxonomy_idx" ON "workspace_hazards" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_user_idx" ON "workspaces" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('owner', 'editor', 'viewer'));--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_status_check" CHECK ("workspaces"."status" in ('active', 'archived'));