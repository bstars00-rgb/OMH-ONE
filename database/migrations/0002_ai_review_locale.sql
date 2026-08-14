DROP INDEX "ai_reviews_request_idx";--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_reviews_request_locale_idx" ON "ai_reviews" USING btree ("request_id","locale");