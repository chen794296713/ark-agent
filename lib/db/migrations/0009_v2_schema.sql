-- v2 schema: 19 new enum TYPES, 13 new tables, and the column additions to
-- workspaces / agents / agent_improvements / messages.
--
-- docs/TASK_PLAN_V2.md §2.1 splits this across slots 0009-0012 for
-- reviewability. It is one file because drizzle-kit generates one file per
-- `generate`, and hand-splitting generated DDL — with its foreign keys emitted
-- after every table — is a good way to produce a file that applies in isolation
-- and not in sequence.
--
-- The split's actual SAFETY requirement is still met, and is narrower than it
-- looks: the transaction hazard applies only to `ALTER TYPE … ADD VALUE` on a
-- type that already existed. A `CREATE TYPE` and its first use in the same
-- transaction are fine. Every appended value lives in 0007/0008; this file adds
-- no values to an existing type. `npm run db:check` proves it against both a
-- fresh replay and an existing database.
CREATE TYPE "public"."agent_skill_origin" AS ENUM('manual', 'template', 'atg', 'role_default', 'migration');--> statement-breakpoint
CREATE TYPE "public"."agent_skill_state" AS ENUM('pending', 'installing', 'installed', 'failed', 'removing', 'removed');--> statement-breakpoint
CREATE TYPE "public"."context_item_kind" AS ENUM('file', 'text', 'url');--> statement-breakpoint
CREATE TYPE "public"."context_item_state" AS ENUM('awaiting_upload', 'pending', 'indexing', 'indexed', 'failed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."run_step_phase" AS ENUM('thinking', 'tool_call', 'tool_result', 'message', 'final_answer');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('chat', 'schedule', 'channel', 'api', 'self', 'system');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('cron', 'interval', 'once');--> statement-breakpoint
CREATE TYPE "public"."schedule_overlap" AS ENUM('skip', 'queue', 'parallel');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('search-research', 'browser-automation', 'coding-dev-tools', 'version-control', 'devops-cloud', 'data-databases', 'documents-files', 'communication', 'productivity', 'crm-sales-marketing', 'media', 'knowledge-memory', 'agent-meta', 'security-secrets', 'finance-payments', 'design-creative');--> statement-breakpoint
CREATE TYPE "public"."skill_format" AS ENUM('agent_skill', 'mcp_server', 'skill_pack');--> statement-breakpoint
CREATE TYPE "public"."skill_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."skill_source_kind" AS ENUM('registry', 'git_repo', 'curated_list', 'manual');--> statement-breakpoint
CREATE TYPE "public"."skill_source_trust" AS ENUM('official_vendor', 'verified_registry', 'community', 'unreviewed');--> statement-breakpoint
CREATE TYPE "public"."skill_status" AS ENUM('draft', 'published', 'deprecated', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."template_generation_mode" AS ENUM('llm', 'hybrid', 'deterministic');--> statement-breakpoint
CREATE TYPE "public"."template_generation_status" AS ENUM('queued', 'running', 'ready', 'needs_review', 'failed', 'canceled', 'expired', 'materialized');--> statement-breakpoint
CREATE TYPE "public"."template_origin" AS ENUM('generated', 'manual', 'seeded', 'forked');--> statement-breakpoint
CREATE TYPE "public"."template_visibility" AS ENUM('private', 'workspace', 'public');--> statement-breakpoint
CREATE TABLE "agent_context_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"kind" "context_item_kind" NOT NULL,
	"name" varchar(200) NOT NULL,
	"mime" varchar(120),
	"bytes" integer DEFAULT 0 NOT NULL,
	"sha256" varchar(64),
	"content_url" text,
	"text_body" text,
	"source_url" text,
	"scope" varchar(16) DEFAULT 'agent' NOT NULL,
	"state" "context_item_state" DEFAULT 'pending' NOT NULL,
	"state_error" text,
	"chunks" integer,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_health_samples" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_health_samples_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"agent_id" uuid NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"state" varchar(16) NOT NULL,
	"cpu_percent" integer,
	"memory_bytes" bigint,
	"memory_limit_bytes" bigint,
	"disk_used_bytes" bigint,
	"uptime_seconds" bigint,
	"active_runs" integer DEFAULT 0 NOT NULL,
	"source" varchar(16) DEFAULT 'runtime' NOT NULL,
	CONSTRAINT "agent_health_samples_state" CHECK (state IN ('running','idle','stopped','unhealthy')),
	CONSTRAINT "agent_health_samples_source" CHECK (source IN ('runtime','mock','rollup')),
	CONSTRAINT "agent_health_samples_cpu" CHECK (cpu_percent IS NULL OR cpu_percent BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "agent_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"external_step_id" varchar(120) NOT NULL,
	"idx" integer NOT NULL,
	"phase" "run_step_phase" NOT NULL,
	"kind" varchar(32),
	"title" varchar(300) NOT NULL,
	"detail" text,
	"status" varchar(16) DEFAULT 'ok' NOT NULL,
	"duration_ms" integer,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"external_run_id" varchar(120) NOT NULL,
	"trigger" "run_trigger" DEFAULT 'chat' NOT NULL,
	"trigger_ref" varchar(160),
	"session_key" varchar(160),
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"step_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"model" varchar(160),
	"summary" text,
	"error_code" varchar(48),
	"error_message" text,
	"steps_pruned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_schedule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"schedule_name" varchar(120) DEFAULT '' NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'started' NOT NULL,
	"skip_reason" varchar(48),
	"summary" text,
	"error_code" varchar(48),
	"error_message" text,
	"missed_count" integer DEFAULT 0 NOT NULL,
	"missed_truncated" boolean DEFAULT false NOT NULL,
	"trigger" varchar(12) DEFAULT 'schedule' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"expectation_met" boolean,
	"source" varchar(16) DEFAULT 'runtime' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_schedule_runs_trigger" CHECK (trigger IN ('schedule','manual','catch_up')),
	CONSTRAINT "agent_schedule_runs_source" CHECK (source IN ('runtime','mock','local')),
	CONSTRAINT "agent_schedule_runs_status" CHECK (status IN ('started','succeeded','failed','skipped')),
	CONSTRAINT "agent_schedule_runs_skip" CHECK ((status = 'skipped') = (skip_reason IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "agent_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_by_id" uuid,
	"name" varchar(120) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"kind" "schedule_kind" NOT NULL,
	"cron_expr" varchar(120),
	"interval_seconds" integer,
	"run_at" timestamp with time zone,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"prompt" text NOT NULL,
	"session_key" varchar(160),
	"wake_runtime" boolean DEFAULT true NOT NULL,
	"max_runtime_seconds" integer DEFAULT 900 NOT NULL,
	"overlap_policy" "schedule_overlap" DEFAULT 'skip' NOT NULL,
	"catch_up" boolean DEFAULT false NOT NULL,
	"jitter_seconds" integer DEFAULT 0 NOT NULL,
	"max_runs_per_day" integer DEFAULT 288 NOT NULL,
	"deliver_to" varchar(16) DEFAULT 'chat' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" varchar(24),
	"claimed_at" timestamp with time zone,
	"claim_token" uuid,
	"expectation" varchar(280),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_schedules_shape" CHECK ((kind = 'cron' AND cron_expr IS NOT NULL AND interval_seconds IS NULL AND run_at IS NULL)
       OR (kind = 'interval' AND interval_seconds IS NOT NULL AND interval_seconds >= 60 AND cron_expr IS NULL AND run_at IS NULL)
       OR (kind = 'once' AND run_at IS NOT NULL AND cron_expr IS NULL AND interval_seconds IS NULL)),
	CONSTRAINT "agent_schedules_jitter" CHECK (jitter_seconds BETWEEN 0 AND 3600),
	CONSTRAINT "agent_schedules_runtime" CHECK (max_runtime_seconds BETWEEN 30 AND 86400),
	CONSTRAINT "agent_schedules_runs" CHECK (max_runs_per_day BETWEEN 1 AND 288),
	CONSTRAINT "agent_schedules_deliver" CHECK (deliver_to IN ('chat','email','channel','none')),
	CONSTRAINT "agent_schedules_enabled_next" CHECK ((enabled AND next_run_at IS NOT NULL) OR (NOT enabled AND next_run_at IS NULL))
);
--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"version" varchar(60) NOT NULL,
	"harness" "engine" NOT NULL,
	"compat_asserted" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"state" "agent_skill_state" DEFAULT 'pending' NOT NULL,
	"install_error" text,
	"install_run_id" varchar(120),
	"install_source" varchar(16) DEFAULT 'live' NOT NULL,
	"risk_level_at_attach" "skill_risk" NOT NULL,
	"risk_acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_ref" varchar(40) NOT NULL,
	"owner_handle" varchar(80) DEFAULT '' NOT NULL,
	"slug" varchar(120) NOT NULL,
	"install_path" varchar(200) DEFAULT '.agents/skills' NOT NULL,
	"origin" "agent_skill_origin" DEFAULT 'manual' NOT NULL,
	"origin_ref" uuid,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"installed_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"created_by_id" uuid,
	"slug" varchar(48) NOT NULL,
	"name" varchar(60) NOT NULL,
	"summary" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" varchar(24) DEFAULT 'other' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mono" varchar(8) DEFAULT 'T' NOT NULL,
	"hue" varchar(16) DEFAULT '#9AA3B2' NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"harness" "engine" DEFAULT 'openclaw' NOT NULL,
	"min_plan" "plan_tier" DEFAULT 'associate' NOT NULL,
	"visibility" "template_visibility" DEFAULT 'private' NOT NULL,
	"origin" "template_origin" DEFAULT 'generated' NOT NULL,
	"draft" jsonb NOT NULL,
	"draft_schema_version" integer DEFAULT 1 NOT NULL,
	"skill_count" integer DEFAULT 0 NOT NULL,
	"schedule_count" integer DEFAULT 0 NOT NULL,
	"agent_count" integer DEFAULT 1 NOT NULL,
	"automates" varchar(140) DEFAULT '' NOT NULL,
	"difficulty" varchar(16) DEFAULT 'beginner' NOT NULL,
	"time_to_value_minutes" integer DEFAULT 10 NOT NULL,
	"materializable" boolean DEFAULT true NOT NULL,
	"generation_id" uuid,
	"forked_from_id" uuid,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_event_receipts" (
	"event_id" varchar(120) PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" varchar(48) NOT NULL,
	"seq" bigint,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_ticks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scheduler_ticks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"claimed" integer DEFAULT 0 NOT NULL,
	"dispatched" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"retried" integer DEFAULT 0 NOT NULL,
	"swept" integer DEFAULT 0 NOT NULL,
	"saturated" boolean DEFAULT false NOT NULL,
	"source" varchar(12) DEFAULT 'vercel_cron' NOT NULL,
	CONSTRAINT "scheduler_ticks_source" CHECK (source IN ('vercel_cron','external','manual'))
);
--> statement-breakpoint
CREATE TABLE "skill_sources" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"kind" "skill_source_kind" NOT NULL,
	"trust" "skill_source_trust" DEFAULT 'community' NOT NULL,
	"name" varchar(120) NOT NULL,
	"homepage_url" text NOT NULL,
	"api_base_url" text,
	"attribution_template" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"rate_limit_per_min" integer DEFAULT 60 NOT NULL,
	"sync_cursor" text,
	"sync_lock_until" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" varchar(24) DEFAULT 'never' NOT NULL,
	"last_sync_error" varchar(200),
	"last_sync_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar(40) NOT NULL,
	"owner_handle" varchar(80) DEFAULT '' NOT NULL,
	"slug" varchar(120) NOT NULL,
	"public_id" varchar(160) NOT NULL,
	"name" varchar(120) NOT NULL,
	"summary" varchar(300) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"publisher_name" varchar(120) DEFAULT '' NOT NULL,
	"publisher_verified" boolean DEFAULT false NOT NULL,
	"category" "skill_category" NOT NULL,
	"format" "skill_format" DEFAULT 'agent_skill' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"harness_compat" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"harnesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"install" jsonb NOT NULL,
	"redistributable" boolean DEFAULT false NOT NULL,
	"license" varchar(60) DEFAULT 'UNKNOWN' NOT NULL,
	"license_verified" boolean DEFAULT false NOT NULL,
	"risk_level" "skill_risk" DEFAULT 'medium' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_scored_at" timestamp with time zone,
	"scanner_verdict" jsonb,
	"provenance" varchar(60) DEFAULT 'unavailable' NOT NULL,
	"artifact_sha256" varchar(64),
	"blocked" boolean DEFAULT false NOT NULL,
	"block_reason" varchar(200),
	"status" "skill_status" DEFAULT 'draft' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"popularity" integer DEFAULT 0 NOT NULL,
	"source_url" text NOT NULL,
	"attribution_url" text,
	"homepage_url" text,
	"stars" integer DEFAULT 0 NOT NULL,
	"downloads" bigint DEFAULT 0 NOT NULL,
	"upstream_updated_at" timestamp with time zone,
	"upstream_fetched_at" timestamp with time zone,
	"latest_version" varchar(60) DEFAULT '0.0.0' NOT NULL,
	"known_versions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deprecation_note" varchar(200),
	"deprecated_at" timestamp with time zone,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(name,'')), 'A') || setweight(to_tsvector('english', coalesce(replace(slug,'-',' '),'')), 'A') || setweight(to_tsvector('english', coalesce(summary,'')), 'B') || setweight(to_tsvector('english', coalesce(tags::text,'')), 'B')) STORED,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "template_generation_status" DEFAULT 'queued' NOT NULL,
	"mode" "template_generation_mode" DEFAULT 'deterministic' NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"harness" "engine" DEFAULT 'openclaw' NOT NULL,
	"brief" text NOT NULL,
	"brief_sha256" varchar(64) NOT NULL,
	"role_hint" varchar(40),
	"draft" jsonb,
	"stage_traces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"injection_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_code" varchar(40),
	"template_id" uuid,
	"agent_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "messages_external_uniq";--> statement-breakpoint
ALTER TABLE "agent_improvements" ADD COLUMN "kind" varchar(16) DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_improvements" ADD COLUMN "proposal" jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "idempotency_key" varchar(80);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "config_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "applied_config_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "status_occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "timezone" varchar(64) DEFAULT 'Asia/Singapore' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_context_items" ADD CONSTRAINT "agent_context_items_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_health_samples" ADD CONSTRAINT "agent_health_samples_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedule_runs" ADD CONSTRAINT "agent_schedule_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedule_runs" ADD CONSTRAINT "agent_schedule_runs_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_acknowledged_by_id_users_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_forked_from_id_agent_templates_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."agent_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_event_receipts" ADD CONSTRAINT "runtime_event_receipts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_id_skill_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."skill_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generations" ADD CONSTRAINT "template_generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generations" ADD CONSTRAINT "template_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generations" ADD CONSTRAINT "template_generations_template_id_agent_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agent_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generations" ADD CONSTRAINT "template_generations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_context_items_agent_idx" ON "agent_context_items" USING btree ("agent_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_health_samples_agent_sample_uniq" ON "agent_health_samples" USING btree ("agent_id","sampled_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_health_samples_sweep_idx" ON "agent_health_samples" USING btree ("sampled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_steps_uniq" ON "agent_run_steps" USING btree ("run_id","external_step_id");--> statement-breakpoint
CREATE INDEX "agent_run_steps_run_idx" ON "agent_run_steps" USING btree ("run_id","idx");--> statement-breakpoint
CREATE INDEX "agent_run_steps_agent_idx" ON "agent_run_steps" USING btree ("agent_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_external_uniq" ON "agent_runs" USING btree ("agent_id","external_run_id");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_agent_failed_idx" ON "agent_runs" USING btree ("agent_id","started_at" DESC NULLS LAST) WHERE status in ('failed', 'timeout', 'cancelled');--> statement-breakpoint
CREATE INDEX "agent_runs_steps_prune_idx" ON "agent_runs" USING btree ("started_at") WHERE steps_pruned_at is null;--> statement-breakpoint
CREATE INDEX "agent_runs_purge_idx" ON "agent_runs" USING btree ("started_at") WHERE steps_pruned_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_schedule_runs_occurrence_uniq" ON "agent_schedule_runs" USING btree ("schedule_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "agent_schedule_runs_sched_idx" ON "agent_schedule_runs" USING btree ("schedule_id","scheduled_for" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_schedule_runs_open_idx" ON "agent_schedule_runs" USING btree ("started_at") WHERE status = 'started';--> statement-breakpoint
CREATE INDEX "agent_schedule_runs_agent_idx" ON "agent_schedule_runs" USING btree ("agent_id","scheduled_for" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_schedules_agent_idx" ON "agent_schedules" USING btree ("agent_id","enabled");--> statement-breakpoint
CREATE INDEX "agent_schedules_due_idx" ON "agent_schedules" USING btree ("next_run_at","claimed_at") WHERE enabled and next_run_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_skills_agent_skill_uniq" ON "agent_skills" USING btree ("agent_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_skills_agent_identity_uniq" ON "agent_skills" USING btree ("agent_id","source_ref","owner_handle","slug");--> statement-breakpoint
CREATE INDEX "agent_skills_agent_idx" ON "agent_skills" USING btree ("agent_id","state");--> statement-breakpoint
CREATE INDEX "agent_skills_skill_idx" ON "agent_skills" USING btree ("skill_id","version");--> statement-breakpoint
CREATE INDEX "agent_skills_verify_idx" ON "agent_skills" USING btree ("last_verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_templates_ws_slug_uniq" ON "agent_templates" USING btree ("workspace_id","slug") WHERE workspace_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_templates_global_slug_uniq" ON "agent_templates" USING btree ("slug") WHERE workspace_id is null;--> statement-breakpoint
CREATE INDEX "agent_templates_gallery_idx" ON "agent_templates" USING btree ("workspace_id","updated_at" DESC NULLS LAST) WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "agent_templates_gallery_cat_idx" ON "agent_templates" USING btree ("workspace_id","category","updated_at" DESC NULLS LAST) WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "agent_templates_public_idx" ON "agent_templates" USING btree ("category","use_count" DESC NULLS LAST) WHERE visibility = 'public' and archived_at is null;--> statement-breakpoint
CREATE INDEX "agent_templates_tags_gin" ON "agent_templates" USING gin ("tags" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "runtime_event_receipts_agent_idx" ON "runtime_event_receipts" USING btree ("agent_id","received_at");--> statement-breakpoint
CREATE INDEX "runtime_event_receipts_received_idx" ON "runtime_event_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "scheduler_ticks_started_idx" ON "scheduler_ticks" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "skill_sources_enabled_idx" ON "skill_sources" USING btree ("enabled","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_identity_uniq" ON "skills" USING btree ("source_id","owner_handle","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_public_id_uniq" ON "skills" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "skills_browse_idx" ON "skills" USING btree ("status","popularity" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "skills_browse_cat_idx" ON "skills" USING btree ("status","category","popularity" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "skills_source_idx" ON "skills" USING btree ("source_id","status");--> statement-breakpoint
CREATE INDEX "skills_slug_idx" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "skills_risk_idx" ON "skills" USING btree ("status","risk_level","popularity" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "skills_tags_gin" ON "skills" USING gin ("tags" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "skills_harnesses_gin" ON "skills" USING gin ("harnesses" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "skills_search_idx" ON "skills" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "template_generations_ws_idx" ON "template_generations" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "template_generations_status_idx" ON "template_generations" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "template_generations_brief_idx" ON "template_generations" USING btree ("workspace_id","brief_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "template_generations_correlation_uniq" ON "template_generations" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_generations_one_running" ON "template_generations" USING btree ("workspace_id") WHERE status in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "agents_idempotency_uniq" ON "agents" USING btree ("workspace_id","idempotency_key") WHERE idempotency_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_agent_external_uniq" ON "messages" USING btree ("agent_id","external_id");