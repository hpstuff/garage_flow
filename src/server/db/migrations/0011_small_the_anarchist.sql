CREATE TABLE "credit_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"series" text DEFAULT 'A' NOT NULL,
	"number" integer NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"invoice_series" text NOT NULL,
	"invoice_number" integer NOT NULL,
	"vat_mode" "vat_mode" NOT NULL,
	"seller_vat_number" text,
	"customer_name" text NOT NULL,
	"vehicle_plate" text,
	"net" integer NOT NULL,
	"vat" integer,
	"gross" integer NOT NULL,
	"reason" text,
	"currency" text DEFAULT 'BGN' NOT NULL,
	CONSTRAINT "credit_note_location_series_number_unique" UNIQUE("location_id","series","number")
);
--> statement-breakpoint
CREATE TABLE "credit_note_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "line_item_type" NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"vat_rate" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'BGN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_note_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"series" text DEFAULT 'A' NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_series_location_series_unique" UNIQUE("location_id","series")
);
--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_repair_order_id_repair_order_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_line" ADD CONSTRAINT "credit_note_line_credit_note_id_credit_note_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_series" ADD CONSTRAINT "credit_note_series_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_series" ADD CONSTRAINT "credit_note_series_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;