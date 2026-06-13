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
  email: z.string().email().max(320),
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

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  instructions: z.string().max(8000).optional(),
  rules: z.string().max(8000).optional(),
  planTier: z.enum(["associate", "professional", "director"]).optional(),
  channels: z.array(z.enum(CHANNEL_TYPES)).optional(),
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
