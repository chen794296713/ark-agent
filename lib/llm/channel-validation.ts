import { z } from "zod";

export const llmProtocolSchema = z.enum(["openai", "anthropic"]);
export const llmProviderSchema = z.enum(["openai", "anthropic", "openrouter", "deepseek", "xai", "custom"]);

const fields = {
  name: z.string().trim().min(1).max(80),
  provider: llmProviderSchema,
  protocol: llmProtocolSchema,
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().min(1).max(1000),
  enabled: z.boolean(),
  models: z.array(z.string().trim().min(1).max(200)).max(1000),
};

export const createLlmChannelSchema = z.object({
  name: fields.name,
  provider: fields.provider,
  protocol: fields.protocol,
  baseUrl: fields.baseUrl,
  apiKey: fields.apiKey,
  enabled: fields.enabled.optional(),
  models: fields.models.optional(),
}).strict();

export const updateLlmChannelSchema = z.object({
  name: fields.name.optional(),
  provider: fields.provider.optional(),
  protocol: fields.protocol.optional(),
  baseUrl: fields.baseUrl.optional(),
  apiKey: fields.apiKey.optional(),
  enabled: fields.enabled.optional(),
  models: fields.models.optional(),
}).strict().refine((body) => Object.keys(body).length > 0, "At least one field is required");

export const fetchLlmModelsSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("channel"), channelKind: z.enum(["system", "custom"]), channelId: z.string().min(1).max(64) }).strict(),
  z.object({ source: z.literal("draft"), protocol: llmProtocolSchema, baseUrl: fields.baseUrl, apiKey: fields.apiKey }).strict(),
]);

export const llmCallConfigSchema = z.object({
  defaultChannelKind: z.enum(["system", "custom"]),
  primaryChannelKind: z.enum(["system", "custom"]),
  primaryChannelId: z.string().min(1).max(64),
  primaryModel: z.string().trim().min(1).max(200),
  backupChannelKind: z.enum(["system", "custom"]).nullable(),
  backupChannelId: z.string().min(1).max(64).nullable(),
  backupModel: z.string().trim().max(200).nullable(),
}).strict().superRefine((value, ctx) => {
  const fields = [value.backupChannelKind, value.backupChannelId, value.backupModel];
  const present = fields.filter((item) => item !== null && item !== "").length;
  if (present !== 0 && present !== fields.length) {
    ctx.addIssue({ code: "custom", path: ["backupModel"], message: "Backup model requires a channel and model." });
  }
});
