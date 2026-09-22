import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmChannels } from "@/lib/db/schema";
import {
  systemLlmChannels,
  type LlmChannelDTO,
  type LlmModelSelection,
} from "@/lib/llm/channels";

export interface LlmProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const MASKED_KEY = "••••••••";

export function serializeLlmChannel(row: typeof llmChannels.$inferSelect): LlmChannelDTO {
  return {
    id: row.id,
    name: row.name,
    kind: "custom",
    baseUrl: row.baseUrl,
    apiKey: row.apiKeyEncrypted ? MASKED_KEY : "",
    models: row.models,
    configured: Boolean(row.enabled && row.apiKeyEncrypted && row.models.length),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLlmChannels(workspaceId: string): Promise<LlmChannelDTO[]> {
  const custom = await db
    .select()
    .from(llmChannels)
    .where(eq(llmChannels.workspaceId, workspaceId))
    .orderBy(asc(llmChannels.createdAt));
  return [...custom.map(serializeLlmChannel), ...systemLlmChannels()];
}

export async function getCustomLlmChannel(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(llmChannels)
    .where(eq(llmChannels.id, id))
    .limit(1);
  return row?.workspaceId === workspaceId ? row : null;
}

export async function validateModelSelection(
  workspaceId: string,
  selection: LlmModelSelection,
): Promise<boolean> {
  const system = systemLlmChannels().find((channel) => channel.id === selection.channelId);
  if (system) return system.models.includes(selection.model);
  const custom = await getCustomLlmChannel(workspaceId, selection.channelId);
  return Boolean(custom?.models.includes(selection.model));
}

export async function resolveLlmProvider(
  workspaceId: string,
  selection: LlmModelSelection | null | undefined,
): Promise<LlmProviderConfig | null> {
  if (!selection) {
    const model = process.env.LLM_MODEL?.trim() || systemLlmChannels()[0]?.models[0];
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    return apiKey && model ? { apiKey, baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1", model } : null;
  }
  const system = systemLlmChannels().find((channel) => channel.id === selection.channelId);
  if (system && process.env.OPENROUTER_API_KEY?.trim()) {
    return { apiKey: process.env.OPENROUTER_API_KEY.trim(), baseUrl: system.baseUrl, model: selection.model };
  }
  const custom = await getCustomLlmChannel(workspaceId, selection.channelId);
  return custom
    ? { apiKey: custom.apiKeyEncrypted, baseUrl: custom.baseUrl, model: selection.model }
    : null;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function assertPublicHttpsUrl(value: string): URL {
  const url = new URL(normalizeBaseUrl(value));
  if (url.protocol !== "https:") throw new Error("Only HTTPS model endpoints are allowed");
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error("Private network model endpoints are not allowed");
  return url;
}

export async function discoverModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = assertPublicHttpsUrl(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Model endpoint returned ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = Array.from(
      new Set(
        (body.data ?? [])
          .map((item) => (typeof item.id === "string" ? item.id.trim() : ""))
          .filter(Boolean),
      ),
    ).slice(0, 500);
    if (!models.length) throw new Error("No models were returned by this endpoint");
    return models;
  } finally {
    clearTimeout(timeout);
  }
}
