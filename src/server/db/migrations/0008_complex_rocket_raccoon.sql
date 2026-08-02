CREATE TYPE "public"."vat_mode" AS ENUM('registered', 'not_registered');--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "vat_mode" "vat_mode" DEFAULT 'registered' NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "vat_rate" integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "location" DROP COLUMN "vat_config";