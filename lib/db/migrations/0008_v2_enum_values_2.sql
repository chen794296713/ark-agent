-- Enum values ONLY. Nothing else may go in this file. The companion to 0007;
-- see that file's header for why enum additions are quarantined (short version:
-- adding and using a value in one pending batch fails on an EXISTING database
-- and passes on a fresh replay, so it breaks production and not CI).
--
-- These could not be appended to 0007: it is already journaled, and drizzle
-- decides applied-ness by timestamp and never re-reads or re-hashes an applied
-- file (dialect.js:64). An amended 0007 would apply on a fresh replay and go
-- green while every already-migrated database silently never received them.
--
-- IF NOT EXISTS is hand-added; drizzle-kit emits a bare ADD VALUE.
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_publish';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_block';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_unblock';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_rescore';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_sync';--> statement-breakpoint
ALTER TYPE "public"."channel_type" ADD VALUE IF NOT EXISTS 'feishu';--> statement-breakpoint
ALTER TYPE "public"."channel_type" ADD VALUE IF NOT EXISTS 'dingtalk';--> statement-breakpoint
ALTER TYPE "public"."channel_type" ADD VALUE IF NOT EXISTS 'wecom';--> statement-breakpoint
ALTER TYPE "public"."llm_call_kind" ADD VALUE IF NOT EXISTS 'template_gen';--> statement-breakpoint
ALTER TYPE "public"."llm_call_kind" ADD VALUE IF NOT EXISTS 'schedule_parse';
