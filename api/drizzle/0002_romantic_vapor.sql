ALTER TABLE "solution_repository_items" ADD COLUMN "source_id" text DEFAULT 'chart-solution-repository' NOT NULL;--> statement-breakpoint
ALTER TABLE "solution_repository_items" ADD COLUMN "source_record_id" text;--> statement-breakpoint
ALTER TABLE "solution_repository_items" ADD COLUMN "source_version" text;--> statement-breakpoint
ALTER TABLE "solution_repository_items" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "solution_repository_items" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "solution_repository_items" ADD COLUMN "attribution" text;--> statement-breakpoint
CREATE UNIQUE INDEX "solution_repository_items_source_record_unique" ON "solution_repository_items" USING btree ("source_id","source_record_id");--> statement-breakpoint
CREATE INDEX "solution_repository_items_source_idx" ON "solution_repository_items" USING btree ("source_id");