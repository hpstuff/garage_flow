ALTER TABLE "vehicle" DROP CONSTRAINT "vehicle_customer_id_customer_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicle" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "anonymized_at" timestamp;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;