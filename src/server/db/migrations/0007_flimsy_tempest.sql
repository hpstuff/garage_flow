CREATE TYPE "public"."kanban_stage" AS ENUM('waiting', 'diagnosing', 'waiting_for_parts', 'repairing', 'ready', 'delivered');--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "hidden_stages" "kanban_stage"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_order" ADD COLUMN "stage" "kanban_stage" DEFAULT 'waiting' NOT NULL;