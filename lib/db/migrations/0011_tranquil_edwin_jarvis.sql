-- The hosted database already contains llm_channels from an earlier schema
-- revision. Keep this migration idempotent so deployments can converge both
-- that table and fresh databases on the same columns.
DO $$
BEGIN
  IF to_regclass('public.llm_channels') IS NULL THEN
    CREATE TABLE "llm_channels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "workspace_id" uuid NOT NULL,
      "name" varchar(100) NOT NULL,
      "provider" varchar(40) DEFAULT 'custom' NOT NULL,
      "protocol" varchar(40) DEFAULT 'openai-compatible' NOT NULL,
      "base_url" varchar(500) NOT NULL,
      "api_key_encrypted" text NOT NULL,
      "enabled" boolean DEFAULT true NOT NULL,
      "models" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "last_synced_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  ELSE
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'llm_channels' AND column_name = 'api_key'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'llm_channels' AND column_name = 'api_key_encrypted'
    ) THEN
      ALTER TABLE "llm_channels" RENAME COLUMN "api_key" TO "api_key_encrypted";
    END IF;
    ALTER TABLE "llm_channels" ADD COLUMN IF NOT EXISTS "provider" varchar(40) DEFAULT 'custom' NOT NULL;
    ALTER TABLE "llm_channels" ADD COLUMN IF NOT EXISTS "protocol" varchar(40) DEFAULT 'openai-compatible' NOT NULL;
    ALTER TABLE "llm_channels" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
    ALTER TABLE "llm_channels" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_channels_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "llm_channels"
      ADD CONSTRAINT "llm_channels_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_channels_workspace_idx" ON "llm_channels" USING btree ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "llm_channels_workspace_name_uniq" ON "llm_channels" USING btree ("workspace_id", "name");
