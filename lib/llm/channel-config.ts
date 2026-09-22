import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmChannels, workspaceLlmConfigs } from "@/lib/db/schema";
import { llmModel, type LlmConnection } from "@/lib/llm/openrouter";

export type LlmProtocol = "openai" | "anthropic";
export type LlmChannelKind = "system" | "custom";

export interface LlmChannelDTO {
  id: string;
  kind: LlmChannelKind;
  name: string;
  provider: string;
  protocol: LlmProtocol;
  baseUrl: string;
  enabled: boolean;
  available: boolean;
  hasApiKey: boolean;
  models: string[];
  lastSyncedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LlmCallConfigDTO {
  defaultChannelKind: LlmChannelKind;
  primaryChannelKind: LlmChannelKind;
  primaryChannelId: string;
  primaryModel: string;
  backupChannelKind: LlmChannelKind | null;
  backupChannelId: string | null;
  backupModel: string | null;
}

export class LlmChannelError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "LlmChannelError";
  }
}

function requireLlmSchema<T>(work: Promise<T>): Promise<T> {
  return work.catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && String(error.code) === "42P01") {
      throw new LlmChannelError("LLM database tables are not initialized. Run npm run db:migrate before using this page.", 503);
    }
    throw error;
  });
}

const PROVIDER_DEFAULTS: Record<string, { protocol: LlmProtocol; baseUrl: string }> = {
  openai: { protocol: "openai", baseUrl: "https://api.openai.com/v1" },
  anthropic: { protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1" },
  openrouter: { protocol: "openai", baseUrl: "https://openrouter.ai/api/v1" },
  deepseek: { protocol: "openai", baseUrl: "https://api.deepseek.com/v1" },
  xai: { protocol: "openai", baseUrl: "https://api.x.ai/v1" },
};

export function providerDefaults(provider: string) {
  return PROVIDER_DEFAULTS[provider] ?? null;
}

export function normalizeBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LlmChannelError("Base URL is invalid.", 422);
  }
  if (url.username || url.password) throw new LlmChannelError("Base URL must not contain credentials.", 422);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
    throw new LlmChannelError("Base URL must use HTTPS.", 422);
  }
  const host = url.hostname.toLowerCase();
  const blockedName = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local");
  const privateIp = isPrivateIpLiteral(host);
  if (process.env.NODE_ENV === "production" && (blockedName || privateIp)) {
    throw new LlmChannelError("Base URL must point to a public provider endpoint.", 422);
  }
  return value;
}

function isPrivateIpLiteral(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "");
  if (!isIP(normalized)) return false;
  if (normalized === "::1" || normalized === "0.0.0.0") return true;
  if (normalized.includes(":")) {
    const lower = normalized.toLowerCase();
    return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb");
  }
  const [a, b] = normalized.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function assertPublicResolution(rawUrl: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const hostname = new URL(rawUrl).hostname;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new LlmChannelError("Could not resolve the model provider host.", 502);
  }
  if (!addresses.length || addresses.some((entry) => isPrivateIpLiteral(entry.address))) {
    throw new LlmChannelError("Base URL must resolve to a public provider endpoint.", 422);
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.LLM_CHANNEL_ENCRYPTION_KEY?.trim();
  if (!raw) throw new LlmChannelError("LLM channel encryption is not configured on this deployment.", 503);
  if (/^[a-f\d]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  throw new LlmChannelError("LLM_CHANNEL_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64).", 503);
}

export function encryptApiKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptApiKey(value: string): string {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new LlmChannelError("Stored channel credential is invalid.", 500);
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new LlmChannelError("Stored channel credential could not be decrypted.", 500);
  }
}

function customDto(row: typeof llmChannels.$inferSelect): LlmChannelDTO {
  return {
    id: row.id,
    kind: "custom",
    name: row.name,
    provider: row.provider,
    protocol: row.protocol as LlmProtocol,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    available: row.enabled,
    hasApiKey: true,
    models: row.models,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function systemLlmChannels(): LlmChannelDTO[] {
  const configured = !!process.env.OPENROUTER_API_KEY?.trim();
  return [{
    id: "system-openrouter",
    kind: "system",
    name: "ArkAgent Default",
    provider: "openrouter",
    protocol: "openai",
    baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    enabled: true,
    available: configured,
    hasApiKey: configured,
    models: [llmModel()],
    lastSyncedAt: null,
    createdAt: null,
    updatedAt: null,
  }];
}

export async function listLlmChannels(workspaceId: string): Promise<{ system: LlmChannelDTO[]; custom: LlmChannelDTO[] }> {
  const rows = await requireLlmSchema(db.select().from(llmChannels).where(eq(llmChannels.workspaceId, workspaceId)).orderBy(asc(llmChannels.createdAt)));
  return { system: systemLlmChannels(), custom: rows.map(customDto) };
}

export async function createLlmChannel(workspaceId: string, input: {
  name: string; provider: string; protocol: LlmProtocol; baseUrl: string; apiKey: string; enabled?: boolean; models?: string[];
}): Promise<LlmChannelDTO> {
  const [row] = await db.insert(llmChannels).values({
    workspaceId,
    name: input.name.trim(),
    provider: input.provider,
    protocol: input.protocol,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    apiKeyEncrypted: encryptApiKey(input.apiKey.trim()),
    enabled: input.enabled ?? true,
    models: input.models ?? [],
  }).returning();
  return customDto(row);
}

export async function updateLlmChannel(workspaceId: string, id: string, input: {
  name?: string; provider?: string; protocol?: LlmProtocol; baseUrl?: string; apiKey?: string; enabled?: boolean; models?: string[];
}): Promise<LlmChannelDTO | null> {
  const [existing] = await db.select().from(llmChannels).where(and(eq(llmChannels.id, id), eq(llmChannels.workspaceId, workspaceId))).limit(1);
  if (!existing) return null;
  const [row] = await db.update(llmChannels).set({
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
    ...(input.baseUrl !== undefined ? { baseUrl: normalizeBaseUrl(input.baseUrl) } : {}),
    ...(input.apiKey?.trim() ? { apiKeyEncrypted: encryptApiKey(input.apiKey.trim()) } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.models !== undefined ? { models: input.models } : {}),
    updatedAt: new Date(),
  }).where(eq(llmChannels.id, id)).returning();
  if (!row.enabled) {
    await db.update(workspaceLlmConfigs).set({
      channelKind: "system", channelId: "system-openrouter", model: llmModel(),
      defaultChannelKind: "system", primaryChannelKind: "system", primaryChannelId: "system-openrouter", primaryModel: llmModel(),
      backupChannelKind: null, backupChannelId: null, backupModel: null, updatedAt: new Date(),
    }).where(and(eq(workspaceLlmConfigs.workspaceId, workspaceId), or(eq(workspaceLlmConfigs.primaryChannelId, id), eq(workspaceLlmConfigs.backupChannelId, id))));
  }
  return customDto(row);
}

export async function deleteLlmChannel(workspaceId: string, id: string): Promise<boolean> {
  const deleted = await db.transaction(async (tx) => {
    await tx.update(workspaceLlmConfigs).set({
      channelKind: "system", channelId: "system-openrouter", model: llmModel(),
      defaultChannelKind: "system", primaryChannelKind: "system", primaryChannelId: "system-openrouter", primaryModel: llmModel(),
      backupChannelKind: null, backupChannelId: null, backupModel: null, updatedAt: new Date(),
    }).where(and(eq(workspaceLlmConfigs.workspaceId, workspaceId), or(eq(workspaceLlmConfigs.primaryChannelId, id), eq(workspaceLlmConfigs.backupChannelId, id))));
    return tx.delete(llmChannels).where(and(eq(llmChannels.id, id), eq(llmChannels.workspaceId, workspaceId))).returning({ id: llmChannels.id });
  });
  return deleted.length > 0;
}

function modelHeaders(protocol: LlmProtocol, apiKey: string): HeadersInit {
  if (protocol === "anthropic") {
    return { "x-api-key": apiKey, "anthropic-version": "2023-06-01", accept: "application/json" };
  }
  return { Authorization: `Bearer ${apiKey}`, accept: "application/json" };
}

export async function fetchProviderModels(input: { protocol: LlmProtocol; baseUrl: string; apiKey: string }): Promise<string[]> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  await assertPublicResolution(baseUrl);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, { headers: modelHeaders(input.protocol, input.apiKey), signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new LlmChannelError("Could not reach the model provider.", 502);
  }
  if (!response.ok) throw new LlmChannelError(`Provider rejected the model request (${response.status}).`, 502);
  const body = await response.json().catch(() => null) as { data?: unknown } | null;
  if (!Array.isArray(body?.data)) throw new LlmChannelError("Provider returned an unsupported model-list response.", 502);
  const models = body.data
    .map((entry) => typeof entry === "string" ? entry : entry && typeof entry === "object" && "id" in entry ? (entry as { id?: unknown }).id : null)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  return [...new Set(models)].sort((a, b) => a.localeCompare(b)).slice(0, 1000);
}

export async function syncStoredChannelModels(workspaceId: string, id: string): Promise<string[] | null> {
  const [row] = await db.select().from(llmChannels).where(and(eq(llmChannels.id, id), eq(llmChannels.workspaceId, workspaceId))).limit(1);
  if (!row) return null;
  const models = await fetchProviderModels({ protocol: row.protocol as LlmProtocol, baseUrl: row.baseUrl, apiKey: decryptApiKey(row.apiKeyEncrypted) });
  await db.update(llmChannels).set({ models, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(llmChannels.id, id));
  return models;
}

export async function fetchSystemModels(id: string): Promise<string[] | null> {
  const channel = systemLlmChannels().find((item) => item.id === id);
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!channel || !key) return null;
  return fetchProviderModels({ protocol: channel.protocol, baseUrl: channel.baseUrl, apiKey: key });
}

export async function getLlmCallConfig(workspaceId: string): Promise<LlmCallConfigDTO> {
  const [row] = await requireLlmSchema(db.select().from(workspaceLlmConfigs).where(eq(workspaceLlmConfigs.workspaceId, workspaceId)).limit(1));
  if (!row) return { defaultChannelKind: "system", primaryChannelKind: "system", primaryChannelId: "system-openrouter", primaryModel: llmModel(), backupChannelKind: null, backupChannelId: null, backupModel: null };
  return {
    defaultChannelKind: (row.defaultChannelKind || row.channelKind) as LlmChannelKind,
    primaryChannelKind: (row.primaryChannelKind || row.channelKind) as LlmChannelKind,
    primaryChannelId: row.primaryChannelId || row.channelId,
    primaryModel: row.primaryModel || row.model,
    backupChannelKind: (row.backupChannelKind as LlmChannelKind | null) ?? null,
    backupChannelId: row.backupChannelId ?? null,
    backupModel: row.backupModel ?? null,
  };
}

/** Resolve the saved choice to a credential-bearing route for server callers. */
export async function resolveWorkspaceLlmConnection(
  workspaceId: string,
  override?: { channelKind: LlmChannelKind; channelId: string; model: string },
): Promise<LlmConnection | null> {
  const config = await getLlmCallConfig(workspaceId);
  const channelKind = override?.channelKind ?? config.primaryChannelKind;
  const channelId = override?.channelId ?? config.primaryChannelId;
  const model = override?.model ?? config.primaryModel;
  if (channelKind === "system") {
    const channel = systemLlmChannels().find((item) => item.id === channelId);
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!channel?.available || !apiKey) return null;
    return { protocol: channel.protocol, provider: channel.provider, baseUrl: channel.baseUrl, apiKey, model: model || channel.models[0] || llmModel() };
  }
  const [channel] = await db.select().from(llmChannels).where(and(eq(llmChannels.id, channelId), eq(llmChannels.workspaceId, workspaceId), eq(llmChannels.enabled, true))).limit(1);
  if (!channel) return null;
  return {
    protocol: channel.protocol as LlmProtocol,
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: decryptApiKey(channel.apiKeyEncrypted),
    model,
  };
}

export async function saveLlmCallConfig(workspaceId: string, input: LlmCallConfigDTO): Promise<LlmCallConfigDTO> {
  const selections = [
    { kind: input.primaryChannelKind, id: input.primaryChannelId, label: "Primary" },
    ...(input.backupChannelKind && input.backupChannelId ? [{ kind: input.backupChannelKind, id: input.backupChannelId, label: "Backup" }] : []),
  ];
  for (const selection of selections) {
    if (selection.kind === "system") {
      if (!systemLlmChannels().some((channel) => channel.id === selection.id)) throw new LlmChannelError(`${selection.label} system channel not found.`, 404);
    } else {
      const [channel] = await db.select({ id: llmChannels.id, enabled: llmChannels.enabled }).from(llmChannels).where(and(eq(llmChannels.id, selection.id), eq(llmChannels.workspaceId, workspaceId))).limit(1);
      if (!channel) throw new LlmChannelError(`${selection.label} custom channel not found.`, 404);
      if (!channel.enabled) throw new LlmChannelError(`Enable the ${selection.label.toLowerCase()} custom channel before selecting it.`, 409);
    }
  }
  await db.insert(workspaceLlmConfigs).values({
    workspaceId,
    channelKind: input.primaryChannelKind,
    channelId: input.primaryChannelId,
    model: input.primaryModel,
    ...input,
  }).onConflictDoUpdate({
    target: workspaceLlmConfigs.workspaceId,
    set: { channelKind: input.primaryChannelKind, channelId: input.primaryChannelId, model: input.primaryModel, ...input, updatedAt: new Date() },
  }).returning();
  return getLlmCallConfig(workspaceId);
}
