ALTER TABLE "workspace_llm_configs" ADD COLUMN "default_channel_kind" varchar(16) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_llm_configs" ADD COLUMN "primary_channel_kind" varchar(16) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_llm_configs" ADD COLUMN "primary_channel_id" varchar(64) DEFAULT 'system-openrouter' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_llm_configs" ADD COLUMN "primary_model" varchar(200) DEFAULT 'openai/gpt-4o-mini' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_llm_configs" ADD COLUMN "backup_channel_kind" varchar(16);--> statement-breakpoint
ALTER TABLE "workspace_llm_configs" ADD COLUMN "backup_channel_id" varchar(64);--> statement-breakpoint
ALTER TABLE "workspace_llm_configs" ADD COLUMN "backup_model" varchar(200);--> statement-breakpoint
UPDATE "workspace_llm_configs" SET
	"default_channel_kind" = "channel_kind",
	"primary_channel_kind" = "channel_kind",
	"primary_channel_id" = "channel_id",
	"primary_model" = "model";
