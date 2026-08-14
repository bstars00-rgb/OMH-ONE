CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"request_id" uuid,
	"scope" text DEFAULT 'GLOBAL' NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"summary" text NOT NULL,
	"recommendation" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'LOW' NOT NULL,
	"reasoning" text,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comparisons" jsonb DEFAULT '[]'::jsonb,
	"helpful_votes" integer DEFAULT 0 NOT NULL,
	"unhelpful_votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"step_id" uuid,
	"approver_id" uuid NOT NULL,
	"action" text NOT NULL,
	"comment" text,
	"action_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"name" text NOT NULL,
	"approver_role" text NOT NULL,
	"approver_id" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_workflow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"name" text NOT NULL,
	"approver_role" text NOT NULL,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"condition_type" text DEFAULT 'ALWAYS' NOT NULL,
	"condition_value" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "approval_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"request_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'DOCUMENT' NOT NULL,
	"storage_path" text NOT NULL,
	"content_hash" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer,
	"department_id" uuid,
	"cost_center_id" uuid,
	"category" text NOT NULL,
	"allocated" numeric(14, 2) DEFAULT '0' NOT NULL,
	"committed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"spent" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"is_international" boolean DEFAULT true NOT NULL,
	"purpose" text NOT NULL,
	"event_name" text,
	"partner" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"duration_days" integer NOT NULL,
	"outbound_flight" text,
	"inbound_flight" text,
	"hotel_name" text,
	"hotel_nights" integer DEFAULT 0 NOT NULL,
	"hotel_rate_per_night" numeric(14, 2),
	"transportation" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"total_original" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "business_trips_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" uuid,
	"author_type" text DEFAULT 'USER' NOT NULL,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"department_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"office_id" uuid,
	"head_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_code" text NOT NULL,
	"name" text NOT NULL,
	"english_name" text,
	"email" text NOT NULL,
	"department_id" uuid,
	"team_id" uuid,
	"office_id" uuid,
	"position" text,
	"manager_id" uuid,
	"employment_type" text DEFAULT 'FULL_TIME' NOT NULL,
	"join_date" date NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"annual_leave_allowance" numeric(5, 1) DEFAULT '15.0' NOT NULL,
	"phone" text,
	"avatar_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"effective_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"trip_request_id" uuid,
	"payment_method" text DEFAULT 'PERSONAL' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"total_original" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reimbursed_at" timestamp with time zone,
	CONSTRAINT "expense_claims_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"expense_date" date NOT NULL,
	"category" text NOT NULL,
	"merchant" text,
	"description" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount_original" numeric(14, 2) DEFAULT '0' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"amount_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"receipt_hash" text,
	"attachment_id" uuid,
	"extracted_by_ai" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generic_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"category" text NOT NULL,
	"details" text,
	"requested_date" date,
	CONSTRAINT "generic_requests_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid,
	"holiday_date" date NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"leave_type" text NOT NULL,
	"allowance" numeric(5, 1) DEFAULT '0' NOT NULL,
	"used" numeric(5, 1) DEFAULT '0' NOT NULL,
	"pending" numeric(5, 1) DEFAULT '0' NOT NULL,
	"carried_over" numeric(5, 1) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"leave_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day_start" boolean DEFAULT false NOT NULL,
	"half_day_end" boolean DEFAULT false NOT NULL,
	"working_days" numeric(5, 1) NOT NULL,
	"calendar_days" integer NOT NULL,
	"reason" text,
	"emergency_contact" text,
	"handover_to" uuid,
	CONSTRAINT "leave_requests_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"request_id" uuid,
	"severity" text DEFAULT 'INFO' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offices_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"applies_to" text NOT NULL,
	"metric" text NOT NULL,
	"operator" text DEFAULT 'LTE' NOT NULL,
	"threshold" numeric(14, 2),
	"threshold_text" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"severity" text DEFAULT 'WARNING' NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_request_id" uuid NOT NULL,
	"item_name" text NOT NULL,
	"description" text,
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"vendor_id" uuid,
	"category" text NOT NULL,
	"purpose" text NOT NULL,
	"required_date" date,
	"budget_id" uuid,
	"quotation_count" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"total_original" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "purchase_requests_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" text NOT NULL,
	"request_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"requester_id" uuid NOT NULL,
	"department_id" uuid,
	"cost_center_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"workflow_id" uuid,
	"current_step_order" integer DEFAULT 0 NOT NULL,
	"amount_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount_original" numeric(14, 2) DEFAULT '0' NOT NULL,
	"due_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"department_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "trip_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount_original" numeric(14, 2) DEFAULT '0' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"amount_base" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_travelers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"primary_role" text DEFAULT 'EMPLOYEE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"country" text,
	"contact_name" text,
	"contact_email" text,
	"rating" integer,
	"is_preferred" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_step_id_approval_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."approval_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_approver_id_employees_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_employees_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_employees_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_trips" ADD CONSTRAINT "business_trips_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_trip_request_id_requests_id_fk" FOREIGN KEY ("trip_request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_claim_id_expense_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."expense_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_requests" ADD CONSTRAINT "generic_requests_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_handover_to_employees_id_fk" FOREIGN KEY ("handover_to") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_employees_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_costs" ADD CONSTRAINT "trip_costs_trip_id_business_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."business_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_travelers" ADD CONSTRAINT "trip_travelers_trip_id_business_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."business_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_travelers" ADD CONSTRAINT "trip_travelers_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_reviews_request_idx" ON "ai_reviews" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "approval_actions_request_idx" ON "approval_actions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_step_order_uq" ON "approval_steps" USING btree ("request_id","step_order");--> statement-breakpoint
CREATE INDEX "approval_steps_approver_idx" ON "approval_steps" USING btree ("approver_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_step_order_uq" ON "approval_workflow_steps" USING btree ("workflow_id","step_order");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_uq" ON "budgets" USING btree ("year","quarter","department_id","category");--> statement-breakpoint
CREATE INDEX "comments_request_idx" ON "comments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "employees_department_idx" ON "employees" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "employees_manager_idx" ON "employees" USING btree ("manager_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rate_uq" ON "exchange_rates" USING btree ("base_currency","quote_currency","effective_date");--> statement-breakpoint
CREATE INDEX "expense_items_hash_idx" ON "expense_items" USING btree ("receipt_hash");--> statement-breakpoint
CREATE INDEX "expense_items_claim_idx" ON "expense_items" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("holiday_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_balance_uq" ON "leave_balances" USING btree ("employee_id","year","leave_type");--> statement-breakpoint
CREATE INDEX "notifications_employee_idx" ON "notifications" USING btree ("employee_id","is_read");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_type_idx" ON "requests" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "requests_requester_idx" ON "requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "requests_department_idx" ON "requests" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "requests_submitted_idx" ON "requests" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_traveler_uq" ON "trip_travelers" USING btree ("trip_id","employee_id");