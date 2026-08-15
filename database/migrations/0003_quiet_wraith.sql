CREATE TABLE "form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ko" text NOT NULL,
	"description_en" text,
	"description_ko" text,
	"office_id" uuid,
	"category" text DEFAULT 'GENERAL' NOT NULL,
	"icon" text DEFAULT 'FileText' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title_pattern" text DEFAULT '' NOT NULL,
	"amount_field" text,
	"workflow_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_ai" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "values" jsonb;--> statement-breakpoint
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_templates_office_idx" ON "form_templates" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "form_templates_category_idx" ON "form_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "requests_template_idx" ON "requests" USING btree ("template_id");