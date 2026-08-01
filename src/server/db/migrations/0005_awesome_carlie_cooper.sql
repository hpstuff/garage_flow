CREATE TYPE "public"."invoice_status" AS ENUM('not_invoiced', 'invoiced');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'partially_paid', 'paid');--> statement-breakpoint
CREATE TABLE "repair_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"mechanic_id" uuid,
	"complaint" text,
	"diagnosis" text,
	"invoice_status" "invoice_status" DEFAULT 'not_invoiced' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order" ADD CONSTRAINT "repair_order_mechanic_id_mechanic_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."mechanic"("id") ON DELETE set null ON UPDATE no action;