CREATE TABLE "workspace_solution_hazards" (
	"workspace_id" text NOT NULL,
	"solution_record_id" text NOT NULL,
	"hazard_id" text NOT NULL,
	CONSTRAINT "workspace_solution_hazards_pk" PRIMARY KEY("workspace_id","solution_record_id","hazard_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_solution_records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_record_id" text,
	"source_version" text,
	"source_updated_at" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"description" text,
	"cost_of_implementation" text,
	"status" text DEFAULT 'published' NOT NULL,
	"license" text,
	"attribution" text,
	"taxonomies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_solution_hazards" ADD CONSTRAINT "workspace_solution_hazards_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_solution_hazards" ADD CONSTRAINT "workspace_solution_hazards_record_fk" FOREIGN KEY ("solution_record_id") REFERENCES "public"."workspace_solution_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_solution_hazards" ADD CONSTRAINT "workspace_solution_hazards_hazard_fk" FOREIGN KEY ("hazard_id") REFERENCES "public"."hazards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_solution_records" ADD CONSTRAINT "workspace_solution_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_solution_records" ADD CONSTRAINT "workspace_solution_records_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_solution_hazards_workspace_idx" ON "workspace_solution_hazards" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_solution_hazards_hazard_idx" ON "workspace_solution_hazards" USING btree ("hazard_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_solution_records_workspace_source_slug_unique" ON "workspace_solution_records" USING btree ("workspace_id","source_id","slug");--> statement-breakpoint
CREATE INDEX "workspace_solution_records_workspace_idx" ON "workspace_solution_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_solution_records_source_idx" ON "workspace_solution_records" USING btree ("source_id","slug");--> statement-breakpoint
CREATE INDEX "workspace_solution_records_status_idx" ON "workspace_solution_records" USING btree ("status");
