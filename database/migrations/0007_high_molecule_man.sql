CREATE TABLE "approval_line_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"member_type" text DEFAULT 'APPROVER' NOT NULL,
	"position" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"office_id" uuid,
	"request_type" text,
	"department_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "approval_line_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "chain_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_line_members" ADD CONSTRAINT "approval_line_members_line_id_approval_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."approval_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_line_members" ADD CONSTRAINT "approval_line_members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_lines" ADD CONSTRAINT "approval_lines_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_lines" ADD CONSTRAINT "approval_lines_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_lines" ADD CONSTRAINT "approval_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_line_members_line_idx" ON "approval_line_members" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "approval_lines_owner_idx" ON "approval_lines" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "approval_lines_office_idx" ON "approval_lines" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "approval_lines_type_idx" ON "approval_lines" USING btree ("request_type");