import "server-only";

import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmChannels } from "@/lib/db/schema";
import {
  fallbackSystemLlmChannels,
  SYSTEM_OPENROUTER_CHANNEL_ID,
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
    kind: row.workspaceId === null ? "system" : "custom",
    baseUrl: row.baseUrl,
    apiKey: row.apiKeyEncrypted ? MASKED_KEY : "",
    models: row.models,
    configured: Boolean(row.enabled && row.apiKeyEncrypted && row.models.length),
    createdAt: row.createdAt.toISOString(),
  };
}

async function listVisibleLlmChannelRows(workspaceId: string) {
  const rows = await db
    .select()
    .from(llmChannels)
    .where(or(eq(llmChannels.workspaceId, workspaceId), isNull(llmChannels.workspaceId)))
    .orderBy(asc(llmChannels.createdAt));
  return [
    ...rows.filter((row) => row.workspaceId !== null),
    ...rows.filter((row) => row.workspaceId === null),
  ];
}

async function hasDatabaseSystemChannels(): Promise<boolean> {
  const rows = await db
    .select({ id: llmChannels.id })
    .from(llmChannels)
    .where(isNull(llmChannels.workspaceId))
    .limit(1);
  return rows.length > 0;
}

export async function listLlmChannels(workspaceId: string): Promise<LlmChannelDTO[]> {
  const rows = await listVisibleLlmChannelRows(workspaceId);
  const custom = rows.filter((row) => row.workspaceId !== null).map(serializeLlmChannel);
  const systemRows = rows.filter((row) => row.workspaceId === null);
  const system = systemRows.length
    ? systemRows.map(serializeLlmChannel)
    : fallbackSystemLlmChannels();
  return [...custom, ...system];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getLlmChannel(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(llmChannels)
    .where(
      and(
        eq(llmChannels.id, id),
        or(eq(llmChannels.workspaceId, workspaceId), isNull(llmChannels.workspaceId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getCustomLlmChannel(workspaceId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(llmChannels)
    .where(and(eq(llmChannels.id, id), eq(llmChannels.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function validateModelSelection(
  workspaceId: string,
  selection: LlmModelSelection,
): Promise<boolean> {
  if (selection.channelId === SYSTEM_OPENROUTER_CHANNEL_ID) {
    if (await hasDatabaseSystemChannels()) return false;
    const fallback = fallbackSystemLlmChannels()[0];
    return Boolean(fallback.configured && fallback.models.includes(selection.model));
  }
  const channel = await getLlmChannel(workspaceId, selection.channelId);
  return Boolean(
    channel?.enabled &&
    channel.apiKeyEncrypted &&
    channel.models.includes(selection.model),
  );
}

export async function resolveLlmProvider(
  workspaceId: string,
  selection: LlmModelSelection | null | undefined,
): Promise<LlmProviderConfig | null> {
  if (!selection) {
    const rows = await listVisibleLlmChannelRows(workspaceId);
    const channel = rows.find(
      (row) => row.enabled && row.apiKeyEncrypted && row.models.length > 0,
    );
    if (channel) {
      return {
        apiKey: channel.apiKeyEncrypted,
        baseUrl: channel.baseUrl,
        model: channel.models[0],
      };
    }
    if (rows.some((row) => row.workspaceId === null)) return null;
    const fallback = fallbackSystemLlmChannels()[0];
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    return apiKey && fallback?.configured && fallback.models[0]
      ? { apiKey, baseUrl: fallback.baseUrl, model: fallback.models[0] }
      : null;
  }
  if (selection.channelId === SYSTEM_OPENROUTER_CHANNEL_ID) {
    if (await hasDatabaseSystemChannels()) return null;
    const fallback = fallbackSystemLlmChannels()[0];
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    return apiKey && fallback?.models.includes(selection.model)
      ? { apiKey, baseUrl: fallback.baseUrl, model: selection.model }
      : null;
  }
  const channel = await getLlmChannel(workspaceId, selection.channelId);
  return channel?.enabled &&
    channel.apiKeyEncrypted &&
    channel.models.includes(selection.model)
    ? { apiKey: channel.apiKeyEncrypted, baseUrl: channel.baseUrl, model: selection.model }
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
