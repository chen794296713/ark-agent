/**
 * ArkAgent database schema (Drizzle ORM / Postgres).
 *
 * Domain model derived from the product spec & use cases (see docs/):
 *  - Identity: users, sessions, workspaces, workspace_members
 *  - Catalog (seeded reference): agent_roles, plans
 *  - Agents: agents + agent_tasks, agent_activities, agent_metrics,
 *            agent_improvements (self-review queue)
 *  - Comms: channels, agent_channels, conversations, messages
 *  - Billing: subscriptions, invoices, usage_records
 *
 * Columns shared with the external Agent Manager (which provisions/monitors the
 * remote OpenClaw/Hermes runtime) live on `agents.*` (vm_*, deployment_*,
 * agent_manager_id, last_heartbeat_at) — see docs/API.md.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  check,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { StoredAgentSettings } from "../agent-settings";
import { HARNESS_IDS, type Harness } from "../harness";
import { CHANNEL_TYPE_IDS, type ChannelType } from "../channels";
import type {
  ImprovementProposal,
  HarnessCompatMap,
  RiskSignal,
  SkillInstall,
  SkillPermissions,
  SkillRequirements,
  SkillVersionRef,
  SyncStats,
} from "../runtime/types";
import type {
  AgentTemplateDraft,
  DraftStageTrace,
  DraftWarning,
  InjectionFinding,
} from "../atg/types";

/**
 * `tsvector` has no first-class Drizzle column type. Declared once here rather
 * than inline so the generated column and any future one agree on the driver
 * shape.
 */
const customTsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const localeEnum = pgEnum("locale", ["en", "zh", "zht", "ja"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
// Built from lib/harness so the set is declared once. The column keeps the
// name `engine` because renaming a live pgEnum is not worth a migration;
// everything above the schema calls it a harness.
export const engineEnum = pgEnum("engine", HARNESS_IDS);
export const agentStatusEnum = pgEnum("agent_status", [
  "draft",
  "provisioning",
  "deploying",
  "working",
  "scheduled",
  "needs_review",
  "paused",
  "error",
  "terminated",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "queued",
  "in_progress",
  "done",
  "blocked",
]);
export const activityTagEnum = pgEnum("activity_tag", [
  "meeting",
  "draft",
  "research",
  "review",
  "outreach",
  "learning",
  "resolved",
  "escalated",
  "summary",
  "published",
  "brief",
  "calendar",
  "docs",
  "system",
]);
export const improvementStatusEnum = pgEnum("improvement_status", [
  "pending",
  "approved",
  "dismissed",
]);
// Built from lib/channels for the same reason engineEnum is built from
// lib/harness: one declaration, and a client component can import the union
// without pulling Drizzle into the browser bundle.
export const channelTypeEnum = pgEnum("channel_type", CHANNEL_TYPE_IDS);
export const channelStatusEnum = pgEnum("channel_status", [
  "connected",
  "pending",
  "disconnected",
  "error",
]);
export const messageSenderEnum = pgEnum("message_sender", ["user", "agent", "system"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
]);
export const planTierEnum = pgEnum("plan_tier", ["associate", "professional", "director"]);
export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "open", "paid", "void"]);
export const paymentProviderEnum = pgEnum("payment_provider", ["stripe", "alipay"]);
/**
 * Lifecycle of a checkout attempt. `pending` is written before the user leaves
 * for the provider; the provider's webhook (Stripe) or notify callback (Alipay)
 * moves it to a terminal state. `closed` is the provider's own timeout/cancel.
 */
export const paymentOrderStatusEnum = pgEnum("payment_order_status", [
  "pending",
  "paid",
  "failed",
  "closed",
  "refunded",
]);
export const usageKindEnum = pgEnum("usage_kind", [
  "message",
  "task",
  "research",
  "compute",
  "adjustment",
]);

/**
 * Platform-wide privilege, distinct from `member_role` which scopes a user
 * inside ONE workspace. `support` can read the admin console; only `admin` can
 * mutate. Checked server-side on every /api/admin route — never in the UI alone.
 */
export const platformRoleEnum = pgEnum("platform_role", ["user", "support", "admin"]);

/** A suspended user keeps their rows but cannot hold or mint a session. */
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

/** External identity providers that can mint an ArkAgent session. */
export const identityProviderEnum = pgEnum("identity_provider", ["google", "wechat"]);

/** Which product surface spent the tokens. */
export const llmCallKindEnum = pgEnum("llm_call_kind", [
  "chat",
  "brief",
  "self_review",
  // v2 — every Agent Template Generator stage call.
  "template_gen",
  // v2 — the natural-language-to-cron model branch, which only runs when the
  // deterministic parser in lib/schedule/parse.ts comes back under its floor.
  "schedule_parse",
]);

export const adminActionEnum = pgEnum("admin_action", [
  "role_changed",
  "status_changed",
  "sessions_revoked",
  "password_reset",
  "user_deleted",
  "identity_unlinked",
  // v2 — the skill-curation verbs. A third-party skill reaching `published` is
  // a privileged act with the same audit weight as a role change.
  "skill_publish",
  "skill_block",
  "skill_unblock",
  "skill_rescore",
  "skill_sync",
]);


// ---------------------------------------------------------------------------
// v2 enums — skills, templates, context, schedules, runs
//
// Declared here and added to Postgres in 0008 (values appended to existing
// types) and 0010-0012 (whole new types). See docs/DATA_MODEL_V2.md §1.
// ---------------------------------------------------------------------------

/** The 16-category taxonomy from docs/research/SKILL_ECOSYSTEM.md §B. Ordered as it renders. */
export const skillCategoryEnum = pgEnum("skill_category", [
  "search-research", "browser-automation", "coding-dev-tools", "version-control",
  "devops-cloud", "data-databases", "documents-files", "communication",
  "productivity", "crm-sales-marketing", "media", "knowledge-memory",
  "agent-meta", "security-secrets", "finance-payments", "design-creative",
]);

/**
 * How a skill is delivered. `agent_skill` is a SKILL.md folder every harness reads;
 * `mcp_server` is a process/URL registered in the harness's MCP client config;
 * `skill_pack` is a repo of many folders that materializes as several directories.
 */
export const skillFormatEnum = pgEnum("skill_format", ["agent_skill", "mcp_server", "skill_pack"]);

/** Higher is riskier. The rubric that produces it is SKILL_REPOSITORY §5.3 and nowhere else. */
export const skillRiskEnum = pgEnum("skill_risk", ["low", "medium", "high"]);

/**
 * `draft` = discovered but unreviewed, invisible outside the admin console.
 * `blocked` = failed a hard gate; never rendered, and existing attachments are quarantined.
 */
export const skillStatusEnum = pgEnum("skill_status", ["draft", "published", "deprecated", "blocked"]);

export const skillSourceKindEnum = pgEnum("skill_source_kind", [
  "registry", "git_repo", "curated_list", "manual",
]);

/**
 * Feeds the −3 "publisher is the service's own vendor" modifier and decides whether a source may
 * ever auto-publish. Only `official_vendor` may, and only for OSI-resolved licences.
 */
export const skillSourceTrustEnum = pgEnum("skill_source_trust", [
  "official_vendor", "verified_registry", "community", "unreviewed",
]);

/**
 * Lifecycle of ONE skill on ONE agent, driven by the runtime.
 * `agent_skill_state`, NOT `agent_skill_status` — TASK_PLAN_V2 §1 conflict C1. The wire event is
 * `agent.skill_state` and its payload field is `state`, so one vocabulary runs end to end and
 * there is no mapping layer for a mapping to be wrong in.
 */
export const agentSkillStateEnum = pgEnum("agent_skill_state", [
  "pending", "installing", "installed", "failed", "removing", "removed",
]);

/** Where the attachment came from, so a template rollout can be audited or reverted wholesale. */
export const agentSkillOriginEnum = pgEnum("agent_skill_origin", [
  "manual", "template", "atg", "role_default", "migration",
]);

export const templateVisibilityEnum = pgEnum("template_visibility", ["private", "workspace", "public"]);

export const templateOriginEnum = pgEnum("template_origin", ["generated", "manual", "seeded", "forked"]);

/**
 * `expired` = 7 days unapproved; the draft is retained and the brief redacted to ''.
 * `materialized` is terminal and does NOT prevent re-materializing the template it produced —
 * that is what agent_templates.use_count counts (§7.3 rollback notes there).
 */
export const templateGenerationStatusEnum = pgEnum("template_generation_status", [
  "queued", "running", "ready", "needs_review", "failed", "canceled", "expired", "materialized",
]);

/** `llm` = every stage modelled · `hybrid` = ≥1 stage fell back · `deterministic` = no LLM key. */
export const templateGenerationModeEnum = pgEnum("template_generation_mode", [
  "llm", "hybrid", "deterministic",
]);

export const contextItemKindEnum = pgEnum("context_item_kind", ["file", "text", "url"]);

/**
 * `awaiting_upload` means NO BYTES EXIST — it is written only by the template generator for a
 * `file_request` row (TASK_PLAN_V2 §1 conflict C3). `pending` means the bytes are here and
 * indexing has not started. Collapsing the two tells the runtime to fetch a null content_url on
 * every generated template, and erases the state the UI draws its [ Upload ] action from.
 * The runtime never writes `awaiting_upload` and must skip such rows silently.
 */
export const contextItemStateEnum = pgEnum("context_item_state", [
  "awaiting_upload", "pending", "indexing", "indexed", "failed", "removed",
]);

export const scheduleKindEnum = pgEnum("schedule_kind", ["cron", "interval", "once"]);

export const scheduleOverlapEnum = pgEnum("schedule_overlap", ["skip", "queue", "parallel"]);

export const runTriggerEnum = pgEnum("run_trigger", ["chat", "schedule", "channel", "api", "self", "system"]);

export const runStatusEnum = pgEnum("run_status", [
  "queued", "running", "succeeded", "failed", "cancelled", "timeout",
]);

export const runStepPhaseEnum = pgEnum("run_step_phase", [
  "thinking", "tool_call", "tool_result", "message", "final_answer",
]);
// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    // Nullable since an SSO-only account never sets one. `hasPassword` is then
    // a fact rather than a proxy, and the type checker finds every read.
    passwordHash: text("password_hash"),
    name: varchar("name", { length: 120 }).notNull(),
    locale: localeEnum("locale").notNull().default("en"),
    platformRole: platformRoleEnum("platform_role").notNull().default("user"),
    status: userStatusEnum("status").notNull().default("active"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_uniq").on(t.email)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Aggregate credit allowance for the current cycle (sum of agent seats).
    creditsIncluded: integer("credits_included").notNull().default(0),
    creditsUsed: integer("credits_used").notNull().default(0),
    cycleResetsAt: timestamp("cycle_resets_at", { withTimezone: true }),
    // Stripe Customer this workspace bills through (`cus_…`). Created lazily on
    // the first international checkout and reused for every later one, so a
    // customer accumulates one payment history instead of one per purchase.
    stripeCustomerId: varchar("stripe_customer_id", { length: 64 }),
    /**
     * The one authoritative IANA zone per workspace. `agent_schedules.timezone`,
     * the template generator's schedule stage, the cron tick and describeCron()
     * all mean THIS when they say "the workspace timezone" — before this column
     * every one of them referenced a field that did not exist.
     *
     * The default is 'Asia/Singapore', not 'UTC', because it has to equal
     * DEFAULT_SETTINGS.timezone (lib/agent-settings.ts) exactly: any other value
     * silently moves the effective zone of every agent that never overrode it.
     * `agent_schedules.timezone` defaults to 'UTC' and that is also right — this
     * column continues an existing behaviour, that one is new.
     */
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Singapore"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("workspaces_owner_idx").on(t.ownerId),
    // One Stripe Customer belongs to exactly one workspace. Without this, two
    // workspaces sharing an id would let a webhook mutate the wrong billing row.
    uniqueIndex("workspaces_stripe_customer_uniq").on(t.stripeCustomerId),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the opaque cookie token; the raw token is never stored.
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_uniq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

/**
 * An external login (Google / WeChat) bound to a local user.
 *
 * `subject` is the provider's stable id for the person — Google's `sub`, and
 * WeChat's `unionid` when the app belongs to an Open Platform account, else its
 * `openid`. Openid is scoped per (user, app), so the unique key carries
 * `appId` too: without it the 网站应用 and the 服务号 mint different strings into
 * one namespace and collide.
 *
 * Because WeChat hands the unionid over only *best effort*, that pair can move
 * underneath a live account — which is what `providerKey` is here to survive.
 * See lib/oauth/identity.ts for the whole argument.
 */
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: identityProviderEnum("provider").notNull(),
    // The OAuth client this subject was minted for (Google client id / WeChat
    // appid). Namespaces `subject`, which is only unique within one app.
    appId: varchar("app_id", { length: 128 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    // The provider's per-app id, namespaced by the app it was minted for:
    // `${appid}:${openid}` for WeChat, NULL for Google (whose `sub` never
    // moves, so it needs no second anchor). Unlike (app_id, subject) this value
    // is derived only from things WeChat returns on *every* call, so it still
    // points at the right row when the unionid appears, vanishes or comes back.
    providerKey: varchar("provider_key", { length: 200 }),
    email: varchar("email", { length: 320 }),
    emailVerified: boolean("email_verified").notNull().default(false),
    displayName: varchar("display_name", { length: 160 }),
    avatarUrl: text("avatar_url"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("user_identities_provider_subject_uniq").on(t.provider, t.appId, t.subject),
    // One row per (provider, provider_key), so the fallback lookup that repairs
    // a moved canonical key can never match two identities.
    //
    // The `where` clause is NOT strictly required: Postgres treats NULLs as
    // distinct in a unique index by default (NULLS DISTINCT), so the Google
    // rows — every one of them NULL here — would not collide even without it.
    // It is written anyway because a partial index keeps those rows out of the
    // btree entirely and states in the schema that this constraint governs
    // WeChat only. Equality on a strict operator implies NOT NULL, so the
    // planner still uses it for `provider_key = $1` lookups.
    uniqueIndex("user_identities_provider_key_uniq")
      .on(t.provider, t.providerKey)
      .where(sql`provider_key is not null`),
    // One account per provider per user, so "unlink" is unambiguous.
    uniqueIndex("user_identities_user_provider_uniq").on(t.userId, t.provider),
    index("user_identities_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Catalog (seeded reference data)
// ---------------------------------------------------------------------------
export const agentRoles = pgTable("agent_roles", {
  id: varchar("id", { length: 40 }).primaryKey(), // prospector, salesmkt, ...
  name: varchar("name", { length: 80 }).notNull(),
  blurb: text("blurb").notNull(),
  longBlurb: text("long_blurb"),
  hue: varchar("hue", { length: 16 }).notNull(),
  mono: varchar("mono", { length: 2 }).notNull(),
  defaultEngine: engineEnum("default_engine").notNull().default("openclaw"),
  defaultInstructions: text("default_instructions"),
  defaultRules: text("default_rules"),
  minPlan: planTierEnum("min_plan").notNull().default("associate"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const plans = pgTable("plans", {
  id: planTierEnum("id").primaryKey(),
  name: varchar("name", { length: 60 }).notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  includedCredits: integer("included_credits").notNull(),
  overageCentsPer1k: integer("overage_cents_per_1k").notNull().default(200),
  // China-market list price, in 分 (CNY minor units). Deliberately a local
  // ladder rather than an FX conversion of the USD one — see lib/pricing.ts,
  // which is the source of truth the seed writes from.
  monthlyPriceFen: integer("monthly_price_fen").notNull().default(0),
  overageFenPer1k: integer("overage_fen_per_1k").notNull().default(1400),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    roleId: varchar("role_id", { length: 40 })
      .notNull()
      .references(() => agentRoles.id),
    engine: engineEnum("engine").notNull().default("openclaw"),
    planTier: planTierEnum("plan_tier").notNull().default("associate"),
    status: agentStatusEnum("status").notNull().default("draft"),
    // The "job brief" the user writes during hire.
    instructions: text("instructions").notNull().default(""),
    rules: text("rules").notNull().default(""),
    // Presentation accent (mirrors role hue but overridable).
    hue: varchar("hue", { length: 16 }),
    creditsUsed: integer("credits_used").notNull().default(0),
    // Configurable agent settings (behavior, autonomy, schedule, model, skills,
    // tools, memory, limits). Merged over DEFAULT_SETTINGS on read.
    settings: jsonb("settings").$type<StoredAgentSettings>().notNull().default({}),

    // ---- Shared with the external Agent Manager ----
    agentManagerId: varchar("agent_manager_id", { length: 120 }),
    vmId: varchar("vm_id", { length: 80 }),
    vmRegion: varchar("vm_region", { length: 40 }),
    deploymentStatus: varchar("deployment_status", { length: 40 }),
    lastError: text("last_error"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    uptimeStartedAt: timestamp("uptime_started_at", { withTimezone: true }),

    /**
     * Client-supplied Idempotency-Key of the request that created this agent —
     * today only POST /api/templates/[id]/materialize. A replayed key finds the
     * existing agent and returns 200 without opening the transaction; without
     * it, a double-click during a slow Manager call bills two seats. The nightly
     * sweep clears it after 24h so it never becomes a permanent join key.
     */
    idempotencyKey: varchar("idempotency_key", { length: 80 }),

    /**
     * The manifest revision the runtime polls against, and the ETag it compares.
     * Incremented in the SAME transaction as any write to this agent's brief,
     * settings, tasks, skills, context items, schedules or channel links —
     * child-table writes included, which is the half that is easy to forget.
     */
    configRevision: integer("config_revision").notNull().default(1),
    /** The revision the runtime has actually applied. Behind => a resync is due. */
    appliedConfigRevision: integer("applied_config_revision").notNull().default(0),

    /**
     * When the runtime says the current status began, as distinct from when we
     * recorded it. Out-of-order webhook delivery is normal, so a status event
     * older than this one is discarded rather than applied.
     */
    statusOccurredAt: timestamp("status_occurred_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agents_workspace_idx").on(t.workspaceId),
    index("agents_status_idx").on(t.status),
    uniqueIndex("agents_manager_id_uniq").on(t.agentManagerId),
    // Partial: the column is null on every agent not created through
    // materialize, and a full unique index would file all of them in one btree.
    uniqueIndex("agents_idempotency_uniq")
      .on(t.workspaceId, t.idempotencyKey)
      .where(sql`idempotency_key is not null`),
  ],
);

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    status: taskStatusEnum("status").notNull().default("queued"),
    meta: varchar("meta", { length: 120 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("agent_tasks_agent_idx").on(t.agentId)],
);

// ---------------------------------------------------------------------------
// Agent Manager config (per-agent provider-specific state from the Agent Manager)
// ---------------------------------------------------------------------------
// One row per (agent, provider). The full upstream response is stored opaquely
// in `config` so the schema doesn't need to grow when the provider adds fields.
// `externalId` is the provider's identifier for the resource (e.g. the
// OpenClaw instance UUID), and `status` / `lastError` are convenience columns
// for fast reads without parsing the whole blob.
export const agentManagerConfig = pgTable(
  "agent_manager_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    externalId: varchar("external_id", { length: 120 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    lastError: text("last_error"),
    // Full upstream response / config blob, opaque to us.
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_manager_config_agent_provider_uniq").on(t.agentId, t.provider),
    index("agent_manager_config_external_idx").on(t.provider, t.externalId),
  ],
);

export const agentActivities = pgTable(
  "agent_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    tag: activityTagEnum("tag").notNull().default("system"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_activities_agent_idx").on(t.agentId, t.occurredAt)],
);

export const agentMetrics = pgTable(
  "agent_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }).notNull(),
    value: varchar("value", { length: 40 }).notNull(),
    delta: varchar("delta", { length: 24 }),
    weight: integer("weight").notNull().default(0), // 0-100 for the bar width
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_metrics_agent_idx").on(t.agentId)],
);

export const agentImprovements = pgTable(
  "agent_improvements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    impact: varchar("impact", { length: 120 }),
    status: improvementStatusEnum("status").notNull().default("pending"),
    /**
     * From the runtime's `agent.improvement` event. varchar rather than an enum
     * because the runtime team extends this vocabulary independently, and an
     * unknown value must render rather than 500.
     */
    kind: varchar("kind", { length: 16 }).notNull().default("other"),
    /**
     * The machine-applicable proposal, when the improvement is one the user can
     * accept with a click (a settings patch, a rule addition). Null for the
     * majority, which are prose.
     */
    proposal: jsonb("proposal").$type<ImprovementProposal>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("agent_improvements_agent_idx").on(t.agentId, t.status)],
);

// ---------------------------------------------------------------------------
// Channels & messaging
// ---------------------------------------------------------------------------
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: channelTypeEnum("type").notNull(),
    status: channelStatusEnum("status").notNull().default("disconnected"),
    label: varchar("label", { length: 80 }),
    // Connection config; secret values are encrypted at the app layer.
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("channels_workspace_idx").on(t.workspaceId),
    uniqueIndex("channels_workspace_type_uniq").on(t.workspaceId, t.type),
  ],
);

export const agentChannels = pgTable(
  "agent_channels",
  {
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.channelId] })],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    subject: varchar("subject", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("conversations_agent_idx").on(t.agentId, t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sender: messageSenderEnum("sender").notNull(),
    body: text("body").notNull(),
    channelType: channelTypeEnum("channel_type").notNull().default("web"),
    status: messageStatusEnum("status").notNull().default("sent"),
    // Idempotency / dedupe key for Agent Manager-delivered messages.
    externalId: varchar("external_id", { length: 160 }),
    meta: varchar("meta", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    // Scoped to the agent: `external_id` is the RUNTIME's id, and two runtimes
    // are free to mint the same one. A global unique index means the second
    // agent's message is silently dropped by the onConflictDoNothing ingest.
    uniqueIndex("messages_agent_external_uniq").on(t.agentId, t.externalId),
  ],
);

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // One subscription = one agent seat.
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    planId: planTierEnum("plan_id").notNull(),
    cycle: billingCycleEnum("cycle").notNull().default("monthly"),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    // How this seat is paid for. Stripe subscriptions renew themselves and
    // carry a `sub_…` in `externalId`; Alipay has no recurring primitive, so an
    // Alipay seat is a one-off payment that opens a fixed period the user must
    // re-pay to extend (`externalId` holds the order number).
    provider: paymentProviderEnum("provider"),
    externalId: varchar("external_id", { length: 80 }),
    currency: varchar("currency", { length: 8 }).notNull().default("usd"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).defaultNow().notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("subscriptions_workspace_idx").on(t.workspaceId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: varchar("number", { length: 40 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("usd"),
    status: invoiceStatusEnum("status").notNull().default("open"),
    provider: paymentProviderEnum("provider"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    pdfUrl: text("pdf_url"),
    // Provider-side identifier: a Stripe invoice/payment-intent id, or the
    // Alipay `out_trade_no`. Lets a support request be traced from our invoice
    // number straight into the provider dashboard.
    providerRef: varchar("provider_ref", { length: 120 }),
    hostedUrl: text("hosted_url"),
  },
  (t) => [
    index("invoices_workspace_idx").on(t.workspaceId, t.issuedAt),
    uniqueIndex("invoices_number_uniq").on(t.number),
  ],
);

/**
 * One row per checkout attempt, for BOTH providers.
 *
 * The row is written *before* the user is redirected to Stripe or Alipay, so an
 * asynchronous confirmation always has a local order to land on. `outTradeNo`
 * is our own order number: it is what we send Alipay as `out_trade_no` and what
 * we set as Stripe's `client_reference_id`, which makes the webhook and the
 * notify callback symmetrical — both look the order up by the same key.
 *
 * Fulfilment (creating the subscription + invoice) happens exactly once, guarded
 * by a conditional UPDATE from `pending` → `paid`; see lib/payments/fulfil.ts.
 */
export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Our order number — `ARK-{base36 time}-{random}`. Unique across providers. */
    outTradeNo: varchar("out_trade_no", { length: 64 }).notNull(),
    provider: paymentProviderEnum("provider").notNull(),
    status: paymentOrderStatusEnum("status").notNull().default("pending"),
    planId: planTierEnum("plan_id").notNull(),
    cycle: billingCycleEnum("cycle").notNull().default("monthly"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** Charged amount in minor units (US cents / 人民币分) — never a float. */
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    /** Where to send the browser once the provider hands control back. */
    returnUrl: text("return_url"),
    /** The provider-hosted page we redirected to (Stripe Checkout / Alipay). */
    payUrl: text("pay_url"),
    // ---- Stripe ----
    stripeSessionId: varchar("stripe_session_id", { length: 120 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 120 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 120 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 64 }),
    // ---- Alipay ----
    alipayTradeStatus: varchar("alipay_trade_status", { length: 32 }),
    /** Verbatim last provider payload, kept for support and reconciliation. */
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    // ---- Fulfilment results ----
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    failureReason: text("failure_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("payment_orders_out_trade_no_uniq").on(t.outTradeNo),
    uniqueIndex("payment_orders_stripe_session_uniq").on(t.stripeSessionId),
    index("payment_orders_workspace_idx").on(t.workspaceId, t.createdAt),
    index("payment_orders_status_idx").on(t.status),
  ],
);

/**
 * Provider events we have already applied, keyed by the provider's own event id
 * (Stripe `evt_…`) or a synthesised key for Alipay notifies. A unique insert
 * that conflicts means "already processed" — the cheapest possible idempotency
 * guard, and the one that survives concurrent webhook redelivery.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: paymentProviderEnum("provider").notNull(),
    eventId: varchar("event_id", { length: 160 }).notNull(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    orderId: uuid("order_id").references(() => paymentOrders.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("payment_events_provider_event_uniq").on(t.provider, t.eventId),
    index("payment_events_order_idx").on(t.orderId),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    kind: usageKindEnum("kind").notNull().default("compute"),
    credits: integer("credits").notNull().default(0),
    note: varchar("note", { length: 160 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("usage_records_workspace_idx").on(t.workspaceId, t.occurredAt)],
);

// ---------------------------------------------------------------------------
// Platform operations
// ---------------------------------------------------------------------------

/**
 * One row per LLM call, written best-effort AFTER the user-facing response has
 * been produced — recording must never fail a request. `estimated` marks rows
 * whose token counts were inferred because the provider returned no usage
 * object (an older gateway, or a proxied OPENROUTER_BASE_URL).
 *
 * The context columns are `set null` rather than `cascade`: deleting a user
 * must not silently rewrite the platform's spend history.
 */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    kind: llmCallKindEnum("kind").notNull(),
    provider: varchar("provider", { length: 40 }).notNull().default("openrouter"),
    model: varchar("model", { length: 160 }).notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    // Micro-USD (1e-6) keeps sub-cent costs exact without a numeric type.
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    estimated: boolean("estimated").notNull().default(false),
    latencyMs: integer("latency_ms"),
    // A NORMALIZED class ("timeout", "upstream_5xx"), never the provider's raw
    // error body — those carry key fragments and prompt text, and this column
    // is served to support staff.
    errorCode: varchar("error_code", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("llm_usage_user_idx").on(t.userId, t.createdAt),
    index("llm_usage_workspace_idx").on(t.workspaceId, t.createdAt),
    index("llm_usage_agent_idx").on(t.agentId, t.createdAt),
    index("llm_usage_created_idx").on(t.createdAt),
  ],
);

/**
 * Append-only trail of privileged mutations. `summary` is a short
 * human-readable sentence composed at the call site — deliberately NOT a
 * before/after dump of the row, which would copy `password_hash` into a table
 * support-tier staff can read.
 */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: adminActionEnum("action").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    summary: varchar("summary", { length: 300 }).notNull(),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("admin_audit_log_actor_idx").on(t.actorUserId, t.createdAt),
    index("admin_audit_log_target_idx").on(t.targetUserId, t.createdAt),
  ],
);


// ---------------------------------------------------------------------------
// v2 tables
//
// Three groups, in migration-slot order:
//   0010  skill_sources · skills · agent_skills          — the Skill Repository
//   0011  agent_templates · template_generations         — the Template Generator
//   0012  agent_context_items · agent_schedules · agent_runs · agent_run_steps
//         agent_schedule_runs · agent_health_samples
//         runtime_event_receipts · scheduler_ticks       — the runtime surface
//
// The 0012 group is written almost entirely by the BACKEND agent service, not
// by this app: docs/BACKEND_INTEGRATION_CONTRACT.md is the contract it codes
// against. Until it does, every one of those tables is legitimately empty, and
// the UI's empty states are the common case rather than an edge case.
// ---------------------------------------------------------------------------

export const skillSources = pgTable(
  "skill_sources",
  {
    // A stable human-readable id, like agent_roles/plans: it appears in every seed literal, in
    // skills.public_id, and in log lines. A uuid here would make the seed unreadable and
    // unmergeable across environments.
    id: varchar("id", { length: 40 }).primaryKey(),
    kind: skillSourceKindEnum("kind").notNull(),
    trust: skillSourceTrustEnum("trust").notNull().default("community"),
    name: varchar("name", { length: 120 }).notNull(),
    homepageUrl: text("homepage_url").notNull(),
    /** Null for kinds we do not crawl (`manual`) or lists with no API (`curated_list`). */
    apiBaseUrl: text("api_base_url"),
    /**
     * URL template for the mandatory link-back, e.g. "https://clawhub.ai/{owner}/skills/{slug}".
     * ClawHub permits third-party directory reuse only if we cache, honour 429 and link back
     * without implying endorsement — a licence condition, not decoration, and the drawer renders
     * it (SKILL_REPOSITORY §7.4).
     */
    attributionTemplate: text("attribution_template"),
    enabled: boolean("enabled").notNull().default(true),
    /** Only ever true for `official_vendor`. Everything else lands in `draft`. */
    autoPublish: boolean("auto_publish").notNull().default(false),
    /**
     * Our self-imposed ceiling, per source, always well under the documented one so a bug on our
     * side cannot get the platform IP-banned. ClawHub documents 3,000/min/IP; we seed 600. The MCP
     * registry publishes no figure, so it and everything else keep the 60 default.
     */
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(60),
    /** Opaque continuation token from the last successful page (ClawHub cursor, MCP nextCursor). */
    syncCursor: text("sync_cursor"),
    /**
     * Cooperative lock, claimed with
     *   UPDATE skill_sources SET sync_lock_until = now() + interval '15 min'
     *   WHERE id = $1 AND (sync_lock_until IS NULL OR sync_lock_until < now()) RETURNING id
     * so a cron and a hand-triggered admin run cannot double-crawl. Serverless has no
     * process-local mutex. It is a LEASE, not a flag: the run's `finally` clears it on success AND
     * on failure, or a 20-second sync locks the admin route out for 15 minutes and every retry 409s.
     */
    syncLockUntil: timestamp("sync_lock_until", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: varchar("last_sync_status", { length: 24 }).notNull().default("never"),
    /** Normalized class ("rate_limited", "http_5xx", "schema_drift") — never a raw upstream body. */
    lastSyncError: varchar("last_sync_error", { length: 200 }),
    /** { fetched, created, updated, skipped, blocked, durationMs } from the last run. §13.2. */
    lastSyncStats: jsonb("last_sync_stats").$type<SyncStats>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("skill_sources_enabled_idx").on(t.enabled, t.kind)],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // ---- Identity ----
    sourceId: varchar("source_id", { length: 40 })
      .notNull()
      .references(() => skillSources.id),
    /**
     * `@steipete`, `anthropics`, `googleapis`. Empty string — NOT null — for sources with no owner
     * namespace: Postgres treats NULLs as distinct in a unique index, so a nullable column would
     * silently permit duplicate (source, slug) rows.
     */
    ownerHandle: varchar("owner_handle", { length: 80 }).notNull().default(""),
    slug: varchar("slug", { length: 120 }).notNull(),
    /**
     * The URL key we mint (mintPublicId, SKILL_REPOSITORY §3). Stable forever once assigned.
     * /api/skills/[slug] resolves this first and falls back to a unique match on `slug`, mirroring
     * ClawHub's own AMBIGUOUS_SKILL_SLUG behaviour so a bare slug in a template still works when
     * it is unambiguous.
     *
     * 160 is a GUARANTEED bound, not a hope: naive concatenation reaches 40+1+80+1+120 = 242 and
     * would throw `value too long` on the first long ClawHub slug. The mint truncates and suffixes
     * a hash, so the length is an invariant of the function rather than a wager on upstream naming.
     */
    publicId: varchar("public_id", { length: 160 }).notNull(),

    // ---- Presentation (UNTRUSTED — sanitized on ingest, SKILL_REPOSITORY §5.5) ----
    name: varchar("name", { length: 120 }).notNull(),
    summary: varchar("summary", { length: 300 }).notNull().default(""),
    description: text("description").notNull().default(""),
    publisherName: varchar("publisher_name", { length: 120 }).notNull().default(""),
    /**
     * True only when the publisher handle is the vendor of the service the skill integrates.
     * `mukul975/Anthropic-Cybersecurity-Skills` is the exact name-vs-authority incoherence
     * ClawHavoc exploited, so the UI shows the raw handle whenever this is false.
     */
    publisherVerified: boolean("publisher_verified").notNull().default(false),

    // ---- Classification ----
    category: skillCategoryEnum("category").notNull(),
    format: skillFormatEnum("format").notNull().default("agent_skill"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),

    // ---- Harness compatibility (an assertion — SKILL_REPOSITORY §2.3) ----
    harnessCompat: jsonb("harness_compat").$type<HarnessCompatMap>().notNull().default({}),
    /**
     * Denormalized list of engine values where harnessCompat[e].supported === true. Written by the
     * same function that writes harnessCompat; exists purely so the browser's harness facet is a
     * `@>` containment lookup against a GIN index instead of a jsonb scan.
     */
    harnesses: jsonb("harnesses").$type<Harness[]>().notNull().default([]),
    /** OpenClaw's `metadata.openclaw.requires` shape, verbatim. §13.4. */
    requirements: jsonb("requirements").$type<SkillRequirements>().notNull().default({}),
    /** Normalized authority the skill asks for, diffable against AgentSettings.tools. §13.5. */
    permissions: jsonb("permissions").$type<SkillPermissions>().notNull().default({}),

    // ---- Install ----
    /** Discriminated on `mode`. §13.6. No default: a skill with no install path is not a skill. */
    install: jsonb("install").$type<SkillInstall>().notNull(),
    /**
     * Legal gate on `install.mode = "inline"` ONLY. A registry/git install is the runtime fetching
     * from the origin under the origin's own terms; shipping bytes ourselves is redistribution and
     * needs a licence that permits it.
     */
    redistributable: boolean("redistributable").notNull().default(false),
    license: varchar("license", { length: 60 }).notNull().default("UNKNOWN"),
    /**
     * False until a human read the SKILL.md frontmatter. All **30** seeded ClawHub rows ship false
     * — no ClawHub listing endpoint returns a licence (SKILL_ECOSYSTEM §F.1). Thirty, not
     * thirty-one: `mcporter` is deliberately excluded (TASK_PLAN_V2 §1 conflict C10).
     */
    licenseVerified: boolean("license_verified").notNull().default(false),

    // ---- Risk (SKILL_REPOSITORY §5) ----
    riskLevel: skillRiskEnum("risk_level").notNull().default("medium"),
    /** Raw rubric total, ≈ −8…+20. Persisted so a band change is explainable and diffable. */
    riskScore: integer("risk_score").notNull().default(0),
    /** The individual triggers, rendered in the drawer as prose. §13.7. */
    riskSignals: jsonb("risk_signals").$type<RiskSignal[]>().notNull().default([]),
    riskScoredAt: timestamp("risk_scored_at", { withTimezone: true }),
    /** Raw ClawHub /verify envelope, or null for GitHub/MCP rows with no scanner. NEVER serialized. */
    scannerVerdict: jsonb("scanner_verdict").$type<Record<string, unknown>>(),
    /** `server-resolved-github-import` | `unavailable` | `git` | `first-party`. */
    provenance: varchar("provenance", { length: 60 }).notNull().default("unavailable"),
    artifactSha256: varchar("artifact_sha256", { length: 64 }),
    /**
     * The manifest's `blocked` field. Denormalized from `status = 'blocked'` on purpose: the
     * runtime is told it may never join our catalogue, so the projection needs a boolean it can
     * read. INVARIANT: `blocked = (status = 'blocked')`, maintained by writing both in ONE
     * statement. Not a CHECK constraint — a two-statement update inside one transaction would
     * violate it at the first statement, and the sync pipeline legitimately writes it that way.
     * `tests/skills-catalog.test.ts` asserts the invariant instead.
     */
    blocked: boolean("blocked").notNull().default(false),
    blockReason: varchar("block_reason", { length: 200 }),

    // ---- Curation ----
    status: skillStatusEnum("status").notNull().default("draft"),
    /** A human read the source. Distinct from `status`: a published skill can be unverified. */
    verified: boolean("verified").notNull().default(false),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    /** 0–100 editorial rank, set by seed and admins. NEVER overwritten by sync. */
    popularity: integer("popularity").notNull().default(0),

    // ---- Upstream facts (owned by sync; never hand-edited) ----
    sourceUrl: text("source_url").notNull(),
    /** The mandatory link-back, materialized from skill_sources.attribution_template. */
    attributionUrl: text("attribution_url"),
    homepageUrl: text("homepage_url"),
    stars: integer("stars").notNull().default(0),
    downloads: bigint("downloads", { mode: "number" }).notNull().default(0),
    /** GitHub `pushed_at`. Drives the +2 "unmaintained" risk modifier. */
    upstreamUpdatedAt: timestamp("upstream_updated_at", { withTimezone: true }),
    upstreamFetchedAt: timestamp("upstream_fetched_at", { withTimezone: true }),
    latestVersion: varchar("latest_version", { length: 60 }).notNull().default("0.0.0"),
    /**
     * Last ≤20 known versions, newest first. Bounded on write. §13.8.
     * Rejected alternative: a `skill_versions` table. An attachment only ever needs the pinned
     * string plus enough history to render "you are 3 versions behind", and a fourth skill table
     * buys a join for that.
     */
    knownVersions: jsonb("known_versions").$type<SkillVersionRef[]>().notNull().default([]),
    deprecationNote: varchar("deprecation_note", { length: 200 }),
    /** WHEN it was deprecated. `status` records that it happened; this records when. */
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),

    /**
     * ATG's retrieval index (AGENT_TEMPLATE_GENERATOR §5.2), declared HERE and nowhere else —
     * TASK_PLAN_V2 §1 conflict C2. Two properties are load-bearing and both failed SILENTLY in the
     * earlier two-declaration version:
     *
     * 1. The configuration is 'english', not 'simple'. ATG queries with
     *    websearch_to_tsquery('english', …); against a 'simple' column the stemmed query lexeme
     *    `invoic` never matches the unstemmed indexed lexeme `invoices`, so capabilityMatch —
     *    3.00 of the ranker's 7.20-point scale — collapses to zero with no error raised. The "we
     *    have four UI languages" objection does not apply: ATG's query text is English by
     *    construction, and browse search stays ILIKE, so nothing user-typed reaches this column.
     * 2. setweight A/B with `tags` included, because ts_rank reads those weights.
     *
     * `coalesce(tags::text,'')` rather than an aggregate over jsonb_array_elements_text(tags):
     * a generation expression MAY NOT CONTAIN A SUBQUERY and Postgres rejects every spelling that
     * does with `cannot use subquery in column generation expression`. The cast is immutable, and
     * '["pdf","extract"]'::text tokenises to `pdf` and `extract` with the punctuation discarded.
     */
    searchTsv: customTsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(name,'')), 'A') || setweight(to_tsvector('english', coalesce(replace(slug,'-',' '),'')), 'A') || setweight(to_tsvector('english', coalesce(summary,'')), 'B') || setweight(to_tsvector('english', coalesce(tags::text,'')), 'B')`,
    ),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("skills_identity_uniq").on(t.sourceId, t.ownerHandle, t.slug),
    uniqueIndex("skills_public_id_uniq").on(t.publicId),
    index("skills_browse_idx").on(t.status, t.popularity.desc(), t.id.asc()),
    index("skills_browse_cat_idx").on(t.status, t.category, t.popularity.desc(), t.id.asc()),
    index("skills_source_idx").on(t.sourceId, t.status),
    index("skills_slug_idx").on(t.slug),
    index("skills_risk_idx").on(t.status, t.riskLevel, t.popularity.desc()),
    // Facet lookups are containment tests. jsonb_path_ops is half the size of the default opclass
    // and supports exactly the `@>` we issue. `.op()` — not a `sql` template — because that is the
    // form drizzle-kit diffs; a raw expression re-generates on every db:generate.
    index("skills_tags_gin").using("gin", t.tags.op("jsonb_path_ops")),
    index("skills_harnesses_gin").using("gin", t.harnesses.op("jsonb_path_ops")),
    // ATG's retrieval index. Ships in the same migration as the column it indexes; without it
    // every `search_tsv @@ q` is a sequential scan of the whole catalogue.
    index("skills_search_idx").using("gin", t.searchTsv),
  ],
);

export const agentSkills = pgTable(
  "agent_skills",
  {
    // A surrogate key rather than the composite: the runtime reports install state per attachment
    // and needs one stable id to address (agent.skill_state.agentSkillId). `agent_channels`'
    // composite-PK style has no lifecycle to track and is not the right precedent here.
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /**
     * RESTRICT, not CASCADE: a catalogue row is never hard-deleted — it goes `deprecated` or
     * `blocked` — and a delete that silently detached skills from live agents would be invisible
     * to the operator AND to the runtime, which would keep the bytes on disk forever.
     */
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),

    /**
     * PINNED at attach. Never "latest". The OWASP AST07 control: a version that was clean when
     * installed can be reclassified later, and floating refs make that undetectable.
     */
    version: varchar("version", { length: 60 }).notNull(),
    /**
     * The harness this attachment was asserted compatible with — a snapshot of agents.engine at
     * attach time. When an agent switches engine, every row where this differs is flagged
     * `needs_recheck` in the UI instead of being assumed portable (AST10).
     */
    harness: engineEnum("harness").notNull(),
    /** A deliberate assertion that this skill runs on `harness`. NEVER defaulted true. */
    compatAsserted: boolean("compat_asserted").notNull().default(false),

    enabled: boolean("enabled").notNull().default(true),
    /**
     * `state`, not `status` — TASK_PLAN_V2 §1 conflict C1. The wire event is `agent.skill_state`
     * and its payload field is `state`; one vocabulary end to end means no mapping layer, and no
     * mapping layer means no place for the mapping to be wrong. ArkAgent writes only `pending`
     * (attach) and `removing` (detach); every other transition comes from the runtime.
     */
    state: agentSkillStateEnum("state").notNull().default("pending"),
    installError: text("install_error"),
    /** The Manager's runId from an agent.skill_state event, for log correlation. */
    installRunId: varchar("install_run_id", { length: 120 }),
    /** "live" | "mock" — so a mock-mode row is never mistaken for a real installation. */
    installSource: varchar("install_source", { length: 16 }).notNull().default("live"),

    /** Snapshot of skills.risk_level at attach. A later re-score shows as drift, not silently. */
    riskLevelAtAttach: skillRiskEnum("risk_level_at_attach").notNull(),
    /** Required before a `high` skill may be attached (SKILL_REPOSITORY §6.5). */
    riskAcknowledged: boolean("risk_acknowledged").notNull().default(false),
    acknowledgedById: uuid("acknowledged_by_id").references(() => users.id, { onDelete: "set null" }),

    /**
     * Per-agent skill config. Env var NAMES and non-secret values only — the secret itself lives
     * in the runtime's own store. `.strict()` is NOT the mechanism: this is a z.record and
     * `.strict()` is a no-op on one. The mechanism is an explicit `.check()` rejecting any key
     * matching the SECRET_KEYS regex already used by the channel-config mask
     * (`lib/serializers.ts:107`, /token|secret|key|appsecret|password/i). It is a module-private
     * `const` today; W2-7 must ADD the `export` keyword to it, so there is one definition and not
     * two that drift. lib/serializers.ts is client-safe (its only value import is mergeSettings;
     * everything else is `import type`), so importing it from lib/skills/schema.ts is fine.
     */
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),

    /**
     * Denormalized from `skills` at attach time, and NOT redundant. The runtime is told
     * (BACKEND_INTEGRATION_CONTRACT §2.5) that identity is this 4-tuple and that it must never
     * join our catalogue; §3.4's agent.skill_state event correlates on exactly these four fields.
     * Without them the webhook handler reverses a join to find its own row. They are a snapshot:
     * if a catalogue row is ever re-keyed, the attachment still resolves to what was installed.
     */
    sourceRef: varchar("source_ref", { length: 40 }).notNull(),
    ownerHandle: varchar("owner_handle", { length: 80 }).notNull().default(""),
    slug: varchar("slug", { length: 120 }).notNull(),
    /** Directory relative to the agent workspace. `.agents/skills` for all four harnesses. */
    installPath: varchar("install_path", { length: 200 }).notNull().default(".agents/skills"),

    origin: agentSkillOriginEnum("origin").notNull().default("manual"),
    /**
     * `agent_templates.id` when origin is `template` or `atg`; null otherwise. **Deliberately not
     * a foreign key** — see the corrections note below. SERVER-SET ONLY: it is never read from the
     * attach body, because an unvalidated client-supplied uuid in an audit field is an audit field
     * that lies.
     */
    originRef: uuid("origin_ref"),
    addedById: uuid("added_by_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }),
    /** Last daily security re-verification of this exact pinned version. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_skills_agent_skill_uniq").on(t.agentId, t.skillId),
    // The contract's stated identity constraint. Equivalent to the one above GIVEN
    // skills_identity_uniq, and asserted anyway: a bad denormalization snapshot then fails loudly
    // at write time instead of quietly at install time on a customer's VM.
    uniqueIndex("agent_skills_agent_identity_uniq").on(t.agentId, t.sourceRef, t.ownerHandle, t.slug),
    index("agent_skills_agent_idx").on(t.agentId, t.state),
    // The recall query: "a skill just went blocked — which agents have it pinned?"
    index("agent_skills_skill_idx").on(t.skillId, t.version),
    // The daily re-verification sweep: oldest-verified first, across all agents.
    index("agent_skills_verify_idx").on(t.lastVerifiedAt),
  ],
);

export const agentTemplates = pgTable(
  "agent_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * NULL = a platform-curated template visible to every workspace. Seeded rows own that case; a
     * user template always has a workspace.
     */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 48 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    summary: varchar("summary", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    category: varchar("category", { length: 24 }).notNull().default("other"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /**
     * 1–2 code points for the avatar tile. varchar(8), not (2): Array.from splits on code points,
     * so a flag is 2 and any ZWJ sequence is more — and a CJK user's first instinct is an emoji.
     * The Zod schema is the tighter bound; the column has headroom on purpose.
     */
    mono: varchar("mono", { length: 8 }).notNull().default("T"),
    hue: varchar("hue", { length: 16 }).notNull().default("#9AA3B2"),
    /**
     * The locale the human-visible strings inside `draft` are written in. A zh template shown to
     * an en viewer renders its own language rather than a machine translation, and the gallery
     * card labels it. This is NOT the viewer's language.
     */
    locale: localeEnum("locale").notNull().default("en"),
    /**
     * The column TYPE is `engine` (the pgEnum the architecture constants mandate); the column NAME
     * is `harness` because `agents.engine` already means something adjacent and a template row
     * carrying both would be unreadable. UI_DESIGN_V2 §C.2 calls it `engine`; this name wins.
     */
    harness: engineEnum("harness").notNull().default("openclaw"),
    minPlan: planTierEnum("min_plan").notNull().default("associate"),
    visibility: templateVisibilityEnum("visibility").notNull().default("private"),
    origin: templateOriginEnum("origin").notNull().default("generated"),
    /**
     * The whole AgentTemplateDraft (§13.10), schema-validated on write AND re-validated on read
     * before materialization. This is the contract with the backend team: everything an agent
     * runtime needs is in here, and nothing about a template lives only in the browser.
     */
    draft: jsonb("draft").$type<AgentTemplateDraft>().notNull(),
    draftSchemaVersion: integer("draft_schema_version").notNull().default(1),

    // ---- Denormalized card fields, so the gallery needs no joins ----
    skillCount: integer("skill_count").notNull().default(0),
    scheduleCount: integer("schedule_count").notNull().default(0),
    agentCount: integer("agent_count").notNull().default(1),
    /** Present tense, one sentence. `meta.summary` is the fallback. Computed at assemble (§2.9). */
    automates: varchar("automates", { length: 140 }).notNull().default(""),
    /** `beginner` | `intermediate` | `advanced`. Computed from skill/context/credential counts. */
    difficulty: varchar("difficulty", { length: 16 }).notNull().default("beginner"),
    /** Setup estimate in minutes. Computed, never model-authored. */
    timeToValueMinutes: integer("time_to_value_minutes").notNull().default(10),
    /** False when an unremediated lint error blocks the one-click path (ATG §6.3). */
    materializable: boolean("materializable").notNull().default(true),

    /**
     * Which generation produced it; NULL for manual/seeded/forked. NOT a foreign key, so purging
     * generation history (§14.5) never cascades into a template a customer relies on. Same
     * decision, same reason, as agent_skills.origin_ref (§6.2 B4).
     */
    generationId: uuid("generation_id"),
    forkedFromId: uuid("forked_from_id").references((): AnyPgColumn => agentTemplates.id, {
      onDelete: "set null",
    }),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Soft delete. The gallery never shows an archived row; materialize still resolves one. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Slugs are unique per workspace. Platform templates (workspace_id IS NULL) need their own
    // constraint: NULLs are distinct in a btree by default, so the plain unique index alone would
    // let two platform templates share a slug.
    uniqueIndex("agent_templates_ws_slug_uniq")
      .on(t.workspaceId, t.slug)
      .where(sql`workspace_id is not null`),
    uniqueIndex("agent_templates_global_slug_uniq")
      .on(t.slug)
      .where(sql`workspace_id is null`),
    // Gallery, no category facet — the default view.
    index("agent_templates_gallery_idx")
      .on(t.workspaceId, t.updatedAt.desc())
      .where(sql`archived_at is null`),
    // Gallery WITH a category facet. Two indexes, for the same reason skills has two (§5.1).
    index("agent_templates_gallery_cat_idx")
      .on(t.workspaceId, t.category, t.updatedAt.desc())
      .where(sql`archived_at is null`),
    // The public gallery, across every workspace.
    index("agent_templates_public_idx")
      .on(t.category, t.useCount.desc())
      .where(sql`visibility = 'public' and archived_at is null`),
    index("agent_templates_tags_gin").using("gin", t.tags.op("jsonb_path_ops")),
  ],
);

export const templateGenerations = pgTable(
  "template_generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: templateGenerationStatusEnum("status").notNull().default("queued"),
    mode: templateGenerationModeEnum("mode").notNull().default("deterministic"),
    locale: localeEnum("locale").notNull().default("en"),
    harness: engineEnum("harness").notNull().default("openclaw"),
    /**
     * The user's words, verbatim. The only way to reproduce a bad generation. REDACTED TO '' when
     * the row expires (§14.5) — a retained free-text description of someone's business seven days
     * after they abandoned it is a liability. NOT NULL, so redaction writes '', never NULL.
     */
    brief: text("brief").notNull(),
    /**
     * SHA-256 of the NORMALIZED brief. Dedupe key, cache key, and the support handle an engineer
     * can ask for without asking for the text. Survives redaction. varchar(64), not char(64), to
     * match `sessions.token_hash` (lib/db/schema.ts:237), which is the same thing.
     */
    briefSha256: varchar("brief_sha256", { length: 64 }).notNull(),
    roleHint: varchar("role_hint", { length: 40 }),
    /** The AgentTemplateDraft once stage 7 succeeds; NULL while queued/running/failed. §13.10. */
    draft: jsonb("draft").$type<AgentTemplateDraft>(),
    /**
     * DraftStageTrace[] (§13.11). Written incrementally, one row-update per stage, so a generation
     * that dies mid-flight still says which stage it died in.
     */
    stageTraces: jsonb("stage_traces").$type<DraftStageTrace[]>().notNull().default([]),
    warnings: jsonb("warnings").$type<DraftWarning[]>().notNull().default([]),
    injectionFindings: jsonb("injection_findings").$type<InjectionFinding[]>().notNull().default([]),
    /** Joins to llm_usage.correlation_id: every model call this generation made. */
    correlationId: uuid("correlation_id").defaultRandom().notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    llmCalls: integer("llm_calls").notNull().default(0),
    durationMs: integer("duration_ms"),
    /**
     * A normalized class only ("timeout", "upstream_5xx", "stage_charter_failed", "stale_sweep").
     * NEVER a provider body: those carry key fragments and verbatim prompt text, and this column
     * is read by support staff. Same rule as llm_usage.error_code (lib/db/schema.ts:751-754).
     */
    errorCode: varchar("error_code", { length: 40 }),
    templateId: uuid("template_id").references(() => agentTemplates.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("template_generations_ws_idx").on(t.workspaceId, t.createdAt.desc()),
    index("template_generations_status_idx").on(t.status, t.createdAt.desc()),
    index("template_generations_brief_idx").on(t.workspaceId, t.briefSha256),
    uniqueIndex("template_generations_correlation_uniq").on(t.correlationId),
    /**
     * One in-flight generation per workspace. This partial unique index IS the whole concurrency
     * control: no lock table, no Redis, and the second request gets its 409 from a constraint
     * violation rather than from a check that raced.
     */
    uniqueIndex("template_generations_one_running")
      .on(t.workspaceId)
      .where(sql`status in ('queued', 'running')`),
  ],
);

export const agentContextItems = pgTable(
  "agent_context_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    kind: contextItemKindEnum("kind").notNull(),
    /** Display filename or title. The runtime sanitises before using it as a path component. */
    name: varchar("name", { length: 200 }).notNull(),
    /** e.g. "application/pdf". Absent for kind='text'. */
    mime: varchar("mime", { length: 120 }),
    /**
     * Byte length. Platform hard ceiling 20 MB per item, enforced at upload — comfortably inside
     * int4, so no bigint. `0` while state = 'awaiting_upload'. A template may set a tighter
     * per-item limit (TemplateContextItem.maxBytes, default 10 MiB); that is enforced at upload,
     * not here, because it is a template preference and this is a platform invariant.
     */
    bytes: integer("bytes").notNull().default(0),
    /** Of the exact bytes at content_url. varchar(64), not char(64) — matches sessions.token_hash. */
    sha256: varchar("sha256", { length: 64 }),
    /**
     * https://app.arkagent.com/api/runtime/context/{id}/content, served against the per-agent
     * manifest token with Cache-Control: no-store. Present only for kind='file' AND
     * state <> 'awaiting_upload'.
     */
    contentUrl: text("content_url"),
    /**
     * The pasted text, inline. Present only for kind='text'. UNTRUSTED user content: it goes into
     * the prompt as data, never as an instruction to the runtime service.
     */
    textBody: text("text_body"),
    /**
     * The URL to fetch, for kind='url'. Fetched in the AGENT'S egress sandbox, never from the
     * control plane — it is a user-supplied URL and therefore an SSRF vector.
     */
    sourceUrl: text("source_url"),
    /** 'agent' = available to every session · 'session' = only where explicitly attached. */
    scope: varchar("scope", { length: 16 }).notNull().default("agent"),
    /**
     * awaiting_upload → pending → indexing → indexed | failed; removed is terminal. The runtime
     * reports every transition EXCEPT awaiting_upload, which only the template generator writes
     * (TASK_PLAN_V2 §1 conflict C3). A row still in awaiting_upload has no bytes: the runtime must
     * skip it silently rather than fetch a null content_url.
     */
    state: contextItemStateEnum("state").notNull().default("pending"),
    stateError: text("state_error"),
    /** Retrievable chunks produced. Informational; null until indexed. */
    chunks: integer("chunks"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_context_items_agent_idx").on(t.agentId, t.state)],
);

export const agentSchedules = pgTable(
  "agent_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /**
     * Who created it. Required by W3-6's acceptance criterion ("`created_by_id` for audit") and
     * absent from BACKEND_INTEGRATION_CONTRACT §2.7's DDL — an omission, not a decision, and the
     * only column in this table the contract does not carry. `set null` for the same reason as
     * agent_skills.added_by_id: deleting a user must not delete an agent's schedules and must not
     * rewrite the fact that a human created one. NULL means the row was written by ATG
     * materialization on behalf of the workspace rather than by a person.
     */
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** false ⇒ never fires. The row is KEPT; disable is not delete. */
    enabled: boolean("enabled").notNull().default(true),
    kind: scheduleKindEnum("kind").notNull(),
    /** 5-field Vixie/POSIX cron, evaluated in `timezone`. lib/schedule/cron.ts is the definition. */
    cronExpr: varchar("cron_expr", { length: 120 }),
    /** ≥60, measured from the END of the previous run. */
    intervalSeconds: integer("interval_seconds"),
    /** Absolute instant for kind='once'. Produced by resolveLocal(), not by string concatenation. */
    runAt: timestamp("run_at", { withTimezone: true }),
    /**
     * IANA. Default 'UTC', NOT a regional value: this is an en/zh/zht/ja product with no single
     * home region, and a row written before the workspace picks a zone must be unambiguous rather
     * than merely plausible (conflict C6). POST /api/agents/[id]/schedules fills it from
     * workspaces.timezone ?? settings.timezone ?? 'UTC'; this default only catches a direct SQL
     * insert. An unknown zone degrades to UTC with an `invalid_timezone` warning, never to a guess.
     */
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    /** The instruction to run. User-authored, injected as a USER turn, never as a system prompt. */
    prompt: text("prompt").notNull(),
    /** Conversation to run in. Default `agent:main:schedule:{id}`, applied at read, not stored. */
    sessionKey: varchar("session_key", { length: 160 }),
    /** true ⇒ start a stopped instance to run this; false ⇒ skip with reason instance_stopped. */
    wakeRuntime: boolean("wake_runtime").notNull().default(true),
    maxRuntimeSeconds: integer("max_runtime_seconds").notNull().default(900),
    overlapPolicy: scheduleOverlapEnum("overlap_policy").notNull().default("skip"),
    /** false ⇒ a fire missed during downtime is dropped. true ⇒ run ONCE on recovery. */
    catchUp: boolean("catch_up").notNull().default(false),
    /** Random 0..n delay, to de-synchronise a fleet that all fires at `0 9 * * *`. */
    jitterSeconds: integer("jitter_seconds").notNull().default(0),
    /**
     * Circuit breaker, 1..288. Past this many fires in one calendar day in `timezone`, skip with
     * reason max_runs_per_day. Guards a cron that was mis-parsed into every-minute. (The literal
     * is not written out here: a step expression contains the two characters that close a JSDoc
     * block, and pasting one into this comment silently truncates it.) Has a column — conflict C4 —
     * because ATG's lint rule ATG-L007 sets a ceiling that would otherwise be discarded at save.
     */
    maxRunsPerDay: integer("max_runs_per_day").notNull().default(288),
    /** chat | email | channel | none. `email` is delivered by ArkAgent; the runtime never sends it. */
    deliverTo: varchar("deliver_to", { length: 16 }).notNull().default("chat"),
    /** Computed by ArkAgent, advisory for the runtime. NULL for a fired `once` or unmatchable cron. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: varchar("last_status", { length: 24 }),
    /**
     * The claim lease, from `REMINDERS_AND_SCHEDULERS.md` §3.0 deltas 1 and 2 — that document
     * owns the execution path and these three columns are its, not this one's. `claimed_at` +
     * `claim_token` are a DURABLE lease (300 s, deliberately longer than the tick route's
     * `maxDuration` of 60) rather than an open transaction: holding a transaction across the
     * dispatch would pin a pooled connection across network I/O, and a killed worker's claim
     * would vanish instead of expiring.
     */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimToken: uuid("claim_token"),
    /**
     * "What a good run looks like" — §1.2 WHAT TO EXPECT there. User-authored, ≤280 chars,
     * dispatched as FENCED DATA inside the user turn. Same trust boundary as `prompt`: never a
     * system instruction, and W3-6's injection acceptance criterion covers both columns.
     */
    expectation: varchar("expectation", { length: 280 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    /**
     * Each arm asserts BOTH that its own discriminant is present AND that the other two are
     * absent. The original OR-chain only did the former, so kind='cron' with interval_seconds = 5
     * satisfied the first arm and stored a row that MEANS something other than what it says
     * (conflict C6).
     */
    check(
      "agent_schedules_shape",
      sql`(kind = 'cron' AND cron_expr IS NOT NULL AND interval_seconds IS NULL AND run_at IS NULL)
       OR (kind = 'interval' AND interval_seconds IS NOT NULL AND interval_seconds >= 60 AND cron_expr IS NULL AND run_at IS NULL)
       OR (kind = 'once' AND run_at IS NOT NULL AND cron_expr IS NULL AND interval_seconds IS NULL)`,
    ),
    // Negative jitter walks next_run_at BACKWARDS and can re-fire an occurrence that already ran;
    // an hour of it de-synchronises a fleet past the point of being a schedule at all.
    check("agent_schedules_jitter", sql`jitter_seconds BETWEEN 0 AND 3600`),
    check("agent_schedules_runtime", sql`max_runtime_seconds BETWEEN 30 AND 86400`),
    check("agent_schedules_runs", sql`max_runs_per_day BETWEEN 1 AND 288`),
    check("agent_schedules_deliver", sql`deliver_to IN ('chat','email','channel','none')`),
    /**
     * `REMINDERS_AND_SCHEDULERS.md` §3.0 delta 3, as a constraint rather than a convention:
     * a disabled row must not keep a `next_run_at`, and an enabled one must have one, or a
     * crashed tick leaves a recurring schedule permanently outside the due index and it never
     * fires again. TEST_PLAN TC-076 asserts the raw UPDATE is rejected.
     */
    check(
      "agent_schedules_enabled_next",
      sql`(enabled AND next_run_at IS NOT NULL) OR (NOT enabled AND next_run_at IS NULL)`,
    ),
    index("agent_schedules_agent_idx").on(t.agentId, t.enabled),
    /**
     * The minute-by-minute due scan. `next_run_at` is nullable and a fired `once` or an
     * unmatchable cron sets it back to NULL; without the IS NOT NULL arm those rows sit in the
     * index forever, growing it without bound with entries the predicate can never select.
     */
    index("agent_schedules_due_idx")
      .on(t.nextRunAt, t.claimedAt)
      .where(sql`enabled and next_run_at is not null`),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** The runtime's own runId. Our second idempotency key, with agent_id. */
    externalRunId: varchar("external_run_id", { length: 120 }).notNull(),
    trigger: runTriggerEnum("trigger").notNull().default("chat"),
    /** scheduleId for trigger='schedule', inbound message id for 'channel', else null. */
    triggerRef: varchar("trigger_ref", { length: 160 }),
    sessionKey: varchar("session_key", { length: 160 }),
    status: runStatusEnum("status").notNull().default("running"),
    /**
     * NOT NULL, which is why out-of-order handling has explicit derivations:
     *  - run_finished before run_started ⇒ started_at = finishedAt - durationMs. This is why
     *    durationMs is REQUIRED on agent.run_finished; the documented "finishedAt - startedAt"
     *    fallback is circular, because there is no startedAt yet.
     *  - run_step for an unknown runId ⇒ the run is created lazily with started_at = the STEP's
     *    occurredAt, status='running', trigger='system'; a late run_started overwrites started_at,
     *    trigger, trigger_ref, session_key and model.
     */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    stepCount: integer("step_count").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /**
     * Cached input tokens. `llm_usage` has no cache column, so the split survives ONLY here —
     * ingest folds cached input into llm_usage.prompt_tokens (contract §3.4, agent.usage).
     */
    cacheTokens: integer("cache_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    /** Micro-USD (1e-6), matching llm_usage.cost_micro_usd. Never a float. */
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    model: varchar("model", { length: 160 }),
    /** ≤500 chars from the runtime. The one line the timeline row renders under the title. */
    summary: text("summary"),
    errorCode: varchar("error_code", { length: 48 }),
    errorMessage: text("error_message"),
    /**
     * Set by the nightly prune when this run's steps are deleted (§14.3). Lets the run detail
     * screen say "step trace pruned after 90 days" instead of rendering an empty trace that looks
     * like a bug, and — more importantly — keeps the prune's driver query from re-scanning the
     * same aged runs every night forever.
     */
    stepsPrunedAt: timestamp("steps_pruned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_runs_external_uniq").on(t.agentId, t.externalRunId),
    /**
     * The timeline's run branch. `id DESC` is the THIRD key column and is not optional:
     * HARNESSES_AND_ACTIVITY §5.4 paginates with the row comparison
     * `(started_at, id) < ($t, $i)`, and without `id` in the index the tiebreak is a heap filter —
     * which is exactly the path a busy agent hits on every page after the first. That document
     * carries this as a PROPOSED amendment to BACKEND_INTEGRATION_CONTRACT §3.3; it is adopted
     * here, so the amendment is closed.
     */
    index("agent_runs_agent_idx").on(t.agentId, t.startedAt.desc(), t.id.desc()),
    /**
     * The ERRORS view (HARNESSES_AND_ACTIVITY §6.6). Partial, because failures are ~1.4 % of a
     * healthy agent's runs, so this holds a few hundred entries against hundreds of thousands and
     * the incident view stays instant on the day it matters. The three values are spelled out
     * rather than `<> 'succeeded'` so that `queued`/`running` rows never enter it.
     */
    index("agent_runs_agent_failed_idx")
      .on(t.agentId, t.startedAt.desc())
      .where(sql`status in ('failed', 'timeout', 'cancelled')`),
    /**
     * The two prune drivers (§14.2, §14.3) are age-scoped ACROSS agents and cannot use the
     * composite above, whose leading column is agent_id.
     *
     * COMPLEMENTARY PARTIAL INDEXES, not one full index on started_at. Together they contain
     * exactly the same entries a full index would, but each is a pure range scan for its own
     * query and each shrinks to the work actually outstanding: the step-prune driver holds only
     * runs whose steps still exist, so it drains to near-zero instead of forcing a nightly walk
     * over five months of already-pruned rows to re-discover that they are already pruned.
     */
    index("agent_runs_steps_prune_idx").on(t.startedAt).where(sql`steps_pruned_at is null`),
    index("agent_runs_purge_idx").on(t.startedAt).where(sql`steps_pruned_at is not null`),
  ],
);

export const agentRunSteps = pgTable(
  "agent_run_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    /**
     * Denormalized from the run. Not redundant: the Activity page's feed is agent-scoped and
     * spans runs, and without this column that query is a join against a table two orders of
     * magnitude smaller — i.e. a nested loop over every run the agent ever had.
     */
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    externalStepId: varchar("external_step_id", { length: 120 }).notNull(),
    /** The runtime's ordering index. Steps are RENDERED by this, never by arrival order. */
    idx: integer("idx").notNull(),
    phase: runStepPhaseEnum("phase").notNull(),
    /** shell|browser|file|http|skill|message|model|mcp. varchar: the runtime extends it freely. */
    kind: varchar("kind", { length: 32 }),
    title: varchar("title", { length: 300 }).notNull(),
    detail: text("detail"),
    /** ok | error. */
    status: varchar("status", { length: 16 }).notNull().default("ok"),
    durationMs: integer("duration_ms"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /**
     * The step's own clock, NOT the run's. `RunStepDTO` calls this `occurredAt` for exactly that
     * reason — TASK_PLAN_V2 §1 conflict C13, where the DTO said `startedAt` and invited a
     * mis-join that would order a step trace by its parent run's clock.
     */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("agent_run_steps_uniq").on(t.runId, t.externalStepId),
    index("agent_run_steps_run_idx").on(t.runId, t.idx),
    // The Activity page's "everything this agent did, newest first" query spans runs. Without this
    // it is a sequential scan of every step in the deployment.
    index("agent_run_steps_agent_idx").on(t.agentId, t.occurredAt.desc()),
  ],
);

export const agentScheduleRuns = pgTable(
  "agent_schedule_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * NO `.references()`, deliberately and permanently — `REMINDERS_AND_SCHEDULERS.md` §3.0
     * delta 11. `ON DELETE CASCADE` erases the history a deleted schedule produced, which is the
     * one thing UC-V2-22 asks DELETE to preserve; `ON DELETE SET NULL` is worse than it looks,
     * because `GET …/runs` filters by `schedule_id`, so the rows survive and nothing can ever
     * read them again. The column stays `NOT NULL`, the label is snapshotted in `schedule_name`,
     * and `agent_id`'s FK is what still bounds the table. A later "helpful" re-add of
     * `.references()` reintroduces the cascade: do not.
     */
    scheduleId: uuid("schedule_id").notNull(),
    /** Snapshot of agent_schedules.name at write time, so history survives the schedule. */
    scheduleName: varchar("schedule_name", { length: 120 }).notNull().default(""),
    /** Denormalized, for the agent-scoped history view — same reason as agent_run_steps.agent_id. */
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    /**
     * The INTENDED fire instant, not the actual start. This is the occurrence's identity and the
     * second idempotency key; a jittered or delayed start must not create a second row.
     */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** started | succeeded | failed | skipped. See the monotonicity rule below. */
    status: varchar("status", { length: 16 }).notNull().default("started"),
    /**
     * instance_stopped | overlap | outside_working_hours | disabled | credit_cap_reached |
     * max_runs_per_day | daily_action_limit — the contract's list — plus the four
     * ArkAgent-originated values REMINDERS_AND_SCHEDULERS.md §8.1 D13 registers:
     * channel_not_bound | misfire | misfire_too_old | dispatch_unsupported. The runtime never
     * sends those four. Required when status='skipped'. Each is a key in
     * lib/i18n/activity.ts with all four languages (created by W3-9, not W5-4 — D20 there).
     */
    skipReason: varchar("skip_reason", { length: 48 }),
    summary: text("summary"),
    errorCode: varchar("error_code", { length: 48 }),
    errorMessage: text("error_message"),
    /**
     * Misfire accounting — `REMINDERS_AND_SCHEDULERS.md` §3.0 delta 5. `missed_truncated`
     * carries `runsBetween()`'s own `truncated` flag, so "247 missed" and "at least 501 missed"
     * are different sentences rather than the same lie (TC-079/TC-080).
     */
    missedCount: integer("missed_count").notNull().default(0),
    missedTruncated: boolean("missed_truncated").notNull().default(false),
    /**
     * Why this occurrence exists. A plain varchar on OUR table rather than a `run_trigger` value:
     * TC-087 wants `manual` for a retry, and adding an enum value would need its own file ahead
     * of use (§1.2). `agent_runs.trigger` stays `'schedule'` with `trigger_ref` = the schedule id.
     */
    trigger: varchar("trigger", { length: 12 }).notNull().default("schedule"),
    /** Retry state — §3.10.2 there. `attempt` starts at 1 for the first dispatch. */
    attempt: integer("attempt").notNull().default(1),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    /** The expectation signal. NULL = not evaluated; the serializer must not coerce it to false. */
    expectationMet: boolean("expectation_met"),
    /** Mirrors agent_health_samples.source — same name, same width — so a mock occurrence is
     *  legible as mock in the UI and in support. */
    source: varchar("source", { length: 16 }).notNull().default("runtime"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_schedule_runs_occurrence_uniq").on(t.scheduleId, t.scheduledFor),
    // The per-schedule history panel, and the stale-`started` sweep. Without the second, the
    // sweep is a full scan of every occurrence ever recorded (§3.0 delta 10 there).
    index("agent_schedule_runs_sched_idx").on(t.scheduleId, t.scheduledFor.desc()),
    index("agent_schedule_runs_open_idx").on(t.startedAt).where(sql`status = 'started'`),
    check("agent_schedule_runs_trigger", sql`trigger IN ('schedule','manual','catch_up')`),
    check("agent_schedule_runs_source", sql`source IN ('runtime','mock','local')`),
    // "Every scheduled thing this agent did" — the Reminders screen's history tab, which spans
    // schedules. agent_id had no index at all in the contract; this query was a sequential scan.
    index("agent_schedule_runs_agent_idx").on(t.agentId, t.scheduledFor.desc()),
    check("agent_schedule_runs_status", sql`status IN ('started','succeeded','failed','skipped')`),
    check("agent_schedule_runs_skip", sql`(status = 'skipped') = (skip_reason IS NOT NULL)`),
  ],
);

export const agentHealthSamples = pgTable(
  "agent_health_samples",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    /** running | idle | stopped | unhealthy. ORTHOGONAL to agents.status: `working` + `idle` is normal. */
    state: varchar("state", { length: 16 }).notNull(),
    /** 0..100 of the container's own limit. Fractional on the wire; ROUNDED here, clamped not rejected. */
    cpuPercent: integer("cpu_percent"),
    memoryBytes: bigint("memory_bytes", { mode: "number" }),
    memoryLimitBytes: bigint("memory_limit_bytes", { mode: "number" }),
    diskUsedBytes: bigint("disk_used_bytes", { mode: "number" }),
    uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),
    activeRuns: integer("active_runs").notNull().default(0),
    /**
     * runtime | mock | rollup. `mock` rows are swept and NEVER rolled up — they must not end up
     * averaged into a real agent's history (contract §3.5), and the UI renders them visibly
     * distinct. `rollup` is written by the §14.4 job in place of the raw rows it replaces.
     */
    source: varchar("source", { length: 16 }).notNull().default("runtime"),
  },
  (t) => [
    /**
     * ONE index doing two jobs. It is UNIQUE — not the plain index the contract specifies —
     * because (a) equal `sampled_at` values from one agent are by definition the same observation,
     * so this is the natural dedupe key for a redelivered batch whose eventIds were regenerated,
     * and (b) it is the ON CONFLICT arbiter the hourly rollup (§14.4) needs: the rollup row is
     * written at the bucket's first instant, where a raw sample may already sit.
     * A DESC unique index serves `WHERE agent_id=$1 ORDER BY sampled_at DESC LIMIT 120` directly,
     * and `ON CONFLICT (agent_id, sampled_at)` DOES infer it — index inference matches columns,
     * collation and opclass, and ignores ASC/DESC, which lives in `indoption`. Verified on 15.13.
     */
    uniqueIndex("agent_health_samples_agent_sample_uniq").on(t.agentId, t.sampledAt.desc()),
    check("agent_health_samples_state", sql`state IN ('running','idle','stopped','unhealthy')`),
    check("agent_health_samples_source", sql`source IN ('runtime','mock','rollup')`),
    // 0..100 of the container's own limit, clamped at ingest, not rejected — a runtime reporting
    // 103 % is a rounding artefact, not a reason to drop a health sample.
    check("agent_health_samples_cpu", sql`cpu_percent IS NULL OR cpu_percent BETWEEN 0 AND 100`),
    /**
     * The retention sweep and the rollup both scan BY AGE ACROSS ALL AGENTS. The composite above
     * cannot serve that — `agent_id` leads it — so without this index the nightly job sequential-
     * scans the largest table in the schema. Same structural point as
     * runtime_event_receipts_received_idx below.
     */
    index("agent_health_samples_sweep_idx").on(t.sampledAt),
  ],
);

export const runtimeEventReceipts = pgTable(
  "runtime_event_receipts",
  {
    /**
     * The runtime's eventId, and the primary key. It MUST NOT be derived from content that can
     * legitimately repeat — a payload hash silently swallows a real second occurrence of an
     * identical activity line. Derive it from the runtime's own event-log primary key, or a ULID.
     */
    eventId: varchar("event_id", { length: 120 }).primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 48 }).notNull(),
    /** Per-agent monotonic counter from the runtime. Optional; it is what makes ordering correct. */
    seq: bigint("seq", { mode: "number" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("runtime_event_receipts_agent_idx").on(t.agentId, t.receivedAt),
    // The 30-day sweep scans by age across all agents; the composite above cannot serve it.
    index("runtime_event_receipts_received_idx").on(t.receivedAt),
  ],
);

export const schedulerTicks = pgTable(
  "scheduler_ticks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    claimed: integer("claimed").notNull().default(0),
    dispatched: integer("dispatched").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    retried: integer("retried").notNull().default(0),
    swept: integer("swept").notNull().default(0),
    /** The claim batch hit its LIMIT — the tick is behind, not idle. */
    saturated: boolean("saturated").notNull().default(false),
    source: varchar("source", { length: 12 }).notNull().default("vercel_cron"),
  },
  (t) => [
    index("scheduler_ticks_started_idx").on(t.startedAt.desc()),
    check("scheduler_ticks_source", sql`source IN ('vercel_cron','external','manual')`),
  ],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AgentRole = typeof agentRoles.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentTask = typeof agentTasks.$inferSelect;
export type AgentActivity = typeof agentActivities.$inferSelect;
export type AgentMetric = typeof agentMetrics.$inferSelect;
export type AgentImprovement = typeof agentImprovements.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type NewPaymentOrder = typeof paymentOrders.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type UserIdentity = typeof userIdentities.$inferSelect;
export type NewUserIdentity = typeof userIdentities.$inferInsert;
export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type PlatformRole = (typeof platformRoleEnum.enumValues)[number];
export type Engine = (typeof engineEnum.enumValues)[number];

/**
 * `Engine` (the column's union) and `Harness` (the catalog's) are two names for
 * one set. They are built from the same array, so they cannot disagree — but a
 * future edit that reintroduces a literal here would break that quietly, and
 * the failure would surface as a runtime `invalid input value for enum`. These
 * assertions turn that into a compile error. Same for channels.
 */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _engineMatchesHarness: AssertEqual<Engine, Harness> = true;
const _channelMatchesCatalog: AssertEqual<
  (typeof channelTypeEnum.enumValues)[number],
  ChannelType
> = true;
void _engineMatchesHarness;
void _channelMatchesCatalog;
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type IdentityProvider = (typeof identityProviderEnum.enumValues)[number];
export type AgentManagerConfig = typeof agentManagerConfig.$inferSelect;

// ---- v2 ----
export type SkillSource = typeof skillSources.$inferSelect;
export type NewSkillSource = typeof skillSources.$inferInsert;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type AgentSkill = typeof agentSkills.$inferSelect;
export type NewAgentSkill = typeof agentSkills.$inferInsert;
export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type NewAgentTemplate = typeof agentTemplates.$inferInsert;
export type TemplateGeneration = typeof templateGenerations.$inferSelect;
export type NewTemplateGeneration = typeof templateGenerations.$inferInsert;
export type AgentContextItem = typeof agentContextItems.$inferSelect;
export type NewAgentContextItem = typeof agentContextItems.$inferInsert;
export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type NewAgentSchedule = typeof agentSchedules.$inferInsert;
export type AgentScheduleRun = typeof agentScheduleRuns.$inferSelect;
export type NewAgentScheduleRun = typeof agentScheduleRuns.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunStep = typeof agentRunSteps.$inferSelect;
export type NewAgentRunStep = typeof agentRunSteps.$inferInsert;
export type AgentHealthSample = typeof agentHealthSamples.$inferSelect;
export type NewAgentHealthSample = typeof agentHealthSamples.$inferInsert;
export type RuntimeEventReceipt = typeof runtimeEventReceipts.$inferSelect;
export type SchedulerTick = typeof schedulerTicks.$inferSelect;

/** Enum unions, so nothing has to re-derive them from a literal array. */
export type SkillCategory = (typeof skillCategoryEnum.enumValues)[number];
export type SkillFormat = (typeof skillFormatEnum.enumValues)[number];
export type SkillRisk = (typeof skillRiskEnum.enumValues)[number];
export type SkillStatus = (typeof skillStatusEnum.enumValues)[number];
export type AgentSkillState = (typeof agentSkillStateEnum.enumValues)[number];
export type AgentSkillOrigin = (typeof agentSkillOriginEnum.enumValues)[number];
export type TemplateVisibility = (typeof templateVisibilityEnum.enumValues)[number];
export type TemplateOrigin = (typeof templateOriginEnum.enumValues)[number];
export type TemplateGenerationStatus = (typeof templateGenerationStatusEnum.enumValues)[number];
export type TemplateGenerationMode = (typeof templateGenerationModeEnum.enumValues)[number];
export type ContextItemKind = (typeof contextItemKindEnum.enumValues)[number];
export type ContextItemState = (typeof contextItemStateEnum.enumValues)[number];
export type ScheduleKind = (typeof scheduleKindEnum.enumValues)[number];
export type ScheduleOverlap = (typeof scheduleOverlapEnum.enumValues)[number];
export type RunTrigger = (typeof runTriggerEnum.enumValues)[number];
export type RunStatus = (typeof runStatusEnum.enumValues)[number];
export type RunStepPhase = (typeof runStepPhaseEnum.enumValues)[number];
