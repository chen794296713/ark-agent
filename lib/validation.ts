import { z } from "zod";
import { HARNESS_IDS } from "@/lib/harness";

export const CHANNEL_TYPES = [
  "telegram",
  "whatsapp",
  "wechat",
  "line",
  "slack",
  "email",
  "web",
] as const;

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().min(1).max(120),
});

export const loginSchema = z.object({
  // Accepts an email OR a plain username (e.g. the seeded `demo` account).
  // Registration still requires a real email, so all new users use real data.
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(200),
});

export const PLATFORM_ROLES = ["user", "support", "admin"] as const;
export const USER_STATUSES = ["active", "suspended"] as const;
export const IDENTITY_PROVIDERS = ["google", "wechat"] as const;

/**
 * Admin mutations are `.strict()` on purpose. Zod strips unknown keys by
 * default, so a stray `platformRole` in a profile body is dropped silently
 * today — but silence is the wrong failure mode for a privilege edit, and the
 * next refactor that switches to `.passthrough()` would turn it into a hole.
 */
export const adminUserRoleSchema = z
  .object({ platformRole: z.enum(PLATFORM_ROLES) })
  .strict();

export const adminUserStatusSchema = z
  .object({ status: z.enum(USER_STATUSES) })
  .strict();

export const adminUserQuerySchema = z
  .object({
    q: z.string().max(200).optional(),
    role: z.enum(PLATFORM_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

/** Setting a first password (SSO-only account) has no current password. */
export const setPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
  })
  .refine(({ currentPassword, newPassword }) => currentPassword !== newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export const createAgentSchema = z.object({
  name: z.string().min(1).max(80),
  roleId: z.string().min(1).max(40),
  managerAgentId: z.number().int().positive().optional(),
  engine: z.enum(HARNESS_IDS),
  planTier: z.enum(["associate", "professional", "director"]).default("associate"),
  instructions: z.string().max(8000).default(""),
  rules: z.string().max(8000).default(""),
  channels: z.array(z.enum(CHANNEL_TYPES)).default([]),
  tasks: z.array(z.string().min(1).max(400)).default([]),
});

export const agentSettingsSchema = z.object({
  tone: z.enum(["professional", "friendly", "concise", "formal", "playful"]).optional(),
  responseLanguage: z.enum(["auto", "en", "zh", "zht", "ja"]).optional(),
  timezone: z.string().max(64).optional(),
  autonomy: z.enum(["suggest", "ask", "auto"]).optional(),
  approvalAmount: z.number().min(0).max(1_000_000).optional(),
  approveExternalSends: z.boolean().optional(),
  dailyActionLimit: z.number().int().min(0).max(100_000).optional(),
  alwaysOn: z.boolean().optional(),
  workStart: z.string().max(5).optional(),
  workEnd: z.string().max(5).optional(),
  workDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  heartbeatMinutes: z.number().int().min(1).max(1440).optional(),
  escalateTo: z.string().max(320).optional(),
  notifyNeedsReview: z.boolean().optional(),
  notifyErrors: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  digestTime: z.string().max(5).optional(),
  model: z.string().max(80).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(200_000).optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  memoryEnabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  knowledgeUrls: z.array(z.string().max(500)).max(50).optional(),
  monthlyCreditCap: z.number().int().min(0).max(100_000_000).optional(),
  skills: z.array(z.string().max(40)).max(64).optional(),
  tools: z
    .object({
      shell: z.boolean(),
      files: z.boolean(),
      browser: z.boolean(),
      docker: z.boolean(),
      code: z.boolean(),
    })
    .partial()
    .optional(),
  selfImprove: z.boolean().optional(),
  autoCreateSkills: z.boolean().optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  instructions: z.string().max(8000).optional(),
  rules: z.string().max(8000).optional(),
  planTier: z.enum(["associate", "professional", "director"]).optional(),
  engine: z.enum(HARNESS_IDS).optional(),
  channels: z.array(z.enum(CHANNEL_TYPES)).optional(),
  settings: agentSettingsSchema.optional(),
});

export const lifecycleSchema = z.object({
  action: z.enum(["pause", "resume", "terminate"]),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  sessionKey: z.string().min(1).max(500).optional(),
});

export const improvementActionSchema = z.object({
  action: z.enum(["approve", "dismiss"]),
});

export const connectChannelSchema = z.object({
  type: z.enum(CHANNEL_TYPES),
  config: z.record(z.string(), z.string()).default({}),
  label: z.string().max(80).optional(),
});

const CHANNEL_TYPE_ALL = ["feishu", "dingtalk", "wechat", "wecom", ...CHANNEL_TYPES] as const;

export const upsertChannelSchema = z.object({
  instanceUuid: z.string(),
  channelType: z.enum(CHANNEL_TYPE_ALL),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const checkoutSchema = z.object({
  planId: z.enum(["associate", "professional", "director"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  // The provider decides the currency: Stripe settles USD (international),
  // Alipay settles CNY (China). The amount itself is always computed
  // server-side from lib/pricing.ts, never accepted from the client.
  provider: z.enum(["stripe", "alipay"]).default("stripe"),
  agentId: z.string().uuid().optional(),
  /** UI language, used for the order subject shown inside the Alipay app. */
  locale: z.enum(["en", "zh", "zht", "ja"]).optional(),
});

/**
 * Billing chart range. `from`/`to` are plain calendar days in UTC — the window
 * is resolved server-side from the workspace's own cycle, so a client cannot
 * ask for another workspace's data by widening the range.
 */
export const billingUsageQuerySchema = z
  .object({
    range: z.enum(["cycle", "last", "d90", "custom"]).default("cycle"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
  })
  .strict();

export const prefsSchema = z.object({
  locale: z.enum(["en", "zh", "zht", "ja"]).optional(),
  name: z.string().min(1).max(120).optional(),
});

export const selfReviewSchema = z.object({
  locale: z.enum(["en", "zh", "zht", "ja"]).optional(),
  count: z.number().int().min(1).max(5).optional(),
});

export const generateBriefSchema = z.object({
  roleId: z.string().min(1).max(40),
  field: z.enum(["instructions", "rules"]),
  agentName: z.string().max(80).optional(),
  draft: z.string().max(8000).optional(),
  locale: z.enum(["en", "zh", "zht", "ja"]).optional(),
});
