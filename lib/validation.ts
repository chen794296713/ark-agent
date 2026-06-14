import { z } from "zod";

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

export const createAgentSchema = z.object({
  name: z.string().min(1).max(80),
  roleId: z.string().min(1).max(40),
  engine: z.enum(["openclaw", "hermes"]),
  planTier: z.enum(["associate", "professional", "director"]).default("associate"),
  instructions: z.string().max(8000).default(""),
  rules: z.string().max(8000).default(""),
  channels: z.array(z.enum(CHANNEL_TYPES)).default([]),
  tasks: z.array(z.string().min(1).max(400)).default([]),
});

export const agentSettingsSchema = z.object({
  tone: z.enum(["professional", "friendly", "concise", "formal", "playful"]).optional(),
  responseLanguage: z.enum(["auto", "en", "zh", "zht"]).optional(),
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
  engine: z.enum(["openclaw", "hermes"]).optional(),
  channels: z.array(z.enum(CHANNEL_TYPES)).optional(),
  settings: agentSettingsSchema.optional(),
});

export const lifecycleSchema = z.object({
  action: z.enum(["pause", "resume", "terminate"]),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

export const improvementActionSchema = z.object({
  action: z.enum(["approve", "dismiss"]),
});

export const connectChannelSchema = z.object({
  type: z.enum(CHANNEL_TYPES),
  config: z.record(z.string(), z.string()).default({}),
  label: z.string().max(80).optional(),
});

export const checkoutSchema = z.object({
  planId: z.enum(["associate", "professional", "director"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  provider: z.enum(["stripe", "alipay"]).default("stripe"),
  agentId: z.string().uuid().optional(),
});

export const prefsSchema = z.object({
  locale: z.enum(["en", "zh", "zht"]).optional(),
  name: z.string().min(1).max(120).optional(),
});
