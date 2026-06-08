DO $$ BEGIN
  CREATE TYPE "public"."category_status" AS ENUM('active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "status" "category_status" DEFAULT 'active' NOT NULL;
