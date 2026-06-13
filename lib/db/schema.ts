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
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const localeEnum = pgEnum("locale", ["en", "zh", "zht"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const engineEnum = pgEnum("engine", ["openclaw", "hermes"]);
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
export const channelTypeEnum = pgEnum("channel_type", [
  "telegram",
  "whatsapp",
  "wechat",
  "line",
  "slack",
  "email",
  "web",
]);
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
export const usageKindEnum = pgEnum("usage_kind", [
  "message",
  "task",
  "research",
  "compute",
  "adjustment",
]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    locale: localeEnum("locale").notNull().default("en"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("workspaces_owner_idx").on(t.ownerId)],
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

    // ---- Shared with the external Agent Manager ----
    agentManagerId: varchar("agent_manager_id", { length: 120 }),
    vmId: varchar("vm_id", { length: 80 }),
    vmRegion: varchar("vm_region", { length: 40 }),
    deploymentStatus: varchar("deployment_status", { length: 40 }),
    lastError: text("last_error"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    uptimeStartedAt: timestamp("uptime_started_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agents_workspace_idx").on(t.workspaceId),
    index("agents_status_idx").on(t.status),
    uniqueIndex("agents_manager_id_uniq").on(t.agentManagerId),
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
    uniqueIndex("messages_external_uniq").on(t.externalId),
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
  },
  (t) => [
    index("invoices_workspace_idx").on(t.workspaceId, t.issuedAt),
    uniqueIndex("invoices_number_uniq").on(t.number),
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
export type UsageRecord = typeof usageRecords.$inferSelect;
