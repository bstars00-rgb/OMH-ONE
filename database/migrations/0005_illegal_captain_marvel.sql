ALTER TABLE "form_templates" ADD COLUMN "amount_commits_budget" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "commits_budget" boolean DEFAULT true NOT NULL;