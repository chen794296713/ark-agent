CREATE TABLE "llm_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"protocol" varchar(24) NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_llm_configs" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"channel_kind" varchar(16) DEFAULT 'system' NOT NULL,
	"channel_id" varchar(64) DEFAULT 'system-openrouter' NOT NULL,
	"model" varchar(200) DEFAULT 'openai/gpt-4o-mini' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_channels" ADD CONSTRAINT "llm_channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_llm_configs" ADD CONSTRAINT "workspace_llm_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_channels_workspace_idx" ON "llm_channels" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_channels_workspace_name_uniq" ON "llm_channels" USING btree ("workspace_id","name");