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
import {
  getOpenClawModelConfig,
  putOpenClawModelConfig,
  type OpenClawModelConfig,
  type OpenClawModelConfigScope,
  type OpenClawModelProvider,
} from "@/app/lib/openclaw_manager_api";
import { currentOpenClawManagerUser } from "@/lib/openclaw-manager-auth";

export interface LlmProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const MASKED_KEY = "••••••••";

function modelNames(provider: OpenClawModelProvider): string[] {
  return Array.from(
    new Set(
      (provider.models ?? [])
        .map((model) => {
          if (!model || typeof model !== "object") return "";
          const value = model as Record<string, unknown>;
          return typeof value.name === "string"
            ? value.name.trim()
            : typeof value.id === "string"
              ? value.id.trim()
              : "";
        })
        .filter(Boolean),
    ),
  );
}

export function serializeManagerLlmProvider(
  provider: OpenClawModelProvider,
  scope: OpenClawModelConfigScope,
  index = 0,
): LlmChannelDTO {
  const models = modelNames(provider);
  const apiKey = typeof provider.api_key === "string" ? provider.api_key.trim() : "";
  return {
    id: provider.key?.trim() || `${scope}:${index}`,
    name: provider.name?.trim() || provider.call_name?.trim() || provider.key?.trim() || "LLM provider",
    kind: scope,
    baseUrl: provider.base_url?.trim() || "",
    apiKey: apiKey ? MASKED_KEY : "",
    models,
    // Manager owns provider credentials and may omit api_key from reads. A
    // provider with models is selectable even when its secret is not echoed.
    configured: Boolean(models.length),
    createdAt: null,
  };
}

function hasManagerUser(): boolean {
  return Boolean(currentOpenClawManagerUser());
}

async function listManagerLlmChannels(): Promise<LlmChannelDTO[]> {
  const [system, custom] = await Promise.all([
    getOpenClawModelConfig("system"),
    getOpenClawModelConfig("custom"),
  ]);
  return [
    ...(custom.providers ?? []).map((provider, index) => serializeManagerLlmProvider(provider, "custom", index)),
    ...(system.providers ?? []).map((provider, index) => serializeManagerLlmProvider(provider, "system", index)),
  ];
}

async function localSystemLlmChannels(workspaceId: string): Promise<LlmChannelDTO[]> {
  const rows = await listVisibleLlmChannelRows(workspaceId);
  const systemRows = rows.filter((row) => row.workspaceId === null);
  return systemRows.length
    ? systemRows.map(serializeLlmChannel)
    : fallbackSystemLlmChannels();
}

async function localCustomLlmChannels(workspaceId: string): Promise<LlmChannelDTO[]> {
  const rows = await listVisibleLlmChannelRows(workspaceId);
  return rows
    .filter((row) => row.workspaceId !== null)
    .map(serializeLlmChannel);
}

function modelConfigForProvider(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  existing?: OpenClawModelProvider;
}): OpenClawModelProvider {
  const existing = input.existing;
  const modelEntries = input.models.map((name) => {
    const old = (existing?.models ?? []).find((model) => {
      const value = model as Record<string, unknown>;
      return value.name === name || value.id === name;
    });
    return old ?? {
      name,
      api: typeof existing?.api === "string" ? existing.api : "openai-completions",
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 128000,
    };
  });
  return {
    ...(existing ?? {}),
    key: existing?.key || input.name,
    call_name: existing?.call_name || input.name,
    name: input.name,
    base_url: input.baseUrl,
    api_key: input.apiKey,
    api: typeof existing?.api === "string" ? existing.api : "openai-completions",
    models: modelEntries,
    scope: "custom",
    feature_description: typeof existing?.feature_description === "string" ? existing.feature_description : "",
  };
}

async function updateManagerCustomConfig(
  providers: OpenClawModelProvider[],
  template?: OpenClawModelConfig,
): Promise<OpenClawModelConfig> {
  const current = template ?? await getOpenClawModelConfig("custom");
  return putOpenClawModelConfig({ ...current, providers });
}

export async function createManagerLlmChannel(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}): Promise<LlmChannelDTO> {
  const config = await getOpenClawModelConfig("custom");
  const provider = modelConfigForProvider(input);
  const result = await updateManagerCustomConfig([...(config.providers ?? []), provider], config);
  const saved = (result.providers ?? []).find((item) => item.key === provider.key) ?? provider;
  return serializeManagerLlmProvider(saved, "custom");
}

export async function updateManagerLlmChannel(
  id: string,
  input: { name: string; baseUrl: string; apiKey: string; models: string[] },
): Promise<LlmChannelDTO | null> {
  const config = await getOpenClawModelConfig("custom");
  const index = (config.providers ?? []).findIndex((provider) => provider.key === id);
  if (index < 0) return null;
  const current = config.providers[index];
  const provider = modelConfigForProvider({ ...input, apiKey: input.apiKey || current.api_key || "", existing: current });
  const providers = [...config.providers];
  providers[index] = provider;
  const result = await updateManagerCustomConfig(providers, config);
  return serializeManagerLlmProvider(result.providers?.find((item) => item.key === id) ?? provider, "custom", index);
}

export async function deleteManagerLlmChannel(id: string): Promise<boolean> {
  const config = await getOpenClawModelConfig("custom");
  const providers = (config.providers ?? []).filter((provider) => provider.key !== id);
  if (providers.length === (config.providers ?? []).length) return false;
  await updateManagerCustomConfig(providers, config);
  return true;
}

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
  if (hasManagerUser()) {
    try {
      const managerChannels = await listManagerLlmChannels();
      const managerSystem = managerChannels.filter(
        (channel) => channel.kind === "system" && channel.models.length > 0,
      );
      const managerCustom = managerChannels.filter(
        (channel) => channel.kind === "custom" && channel.models.length > 0,
      );
      const system = managerSystem.length ? managerSystem : await localSystemLlmChannels(workspaceId);
      // Keep workspace-owned channels visible even when Manager's custom
      // scope is empty or filtered by its per-user permissions.
      const custom = [
        ...managerCustom,
        ...(await localCustomLlmChannels(workspaceId)),
      ];
      const seen = new Set<string>();
      return [...custom, ...system].filter((channel) => {
        if (seen.has(channel.id)) return false;
        seen.add(channel.id);
        return true;
      });
    } catch (error) {
      console.error("Failed to load OpenClaw Manager model config", error);
    }
  }
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
  if (hasManagerUser()) {
    try {
      const configs = await Promise.all([
        getOpenClawModelConfig("system"),
        getOpenClawModelConfig("custom"),
      ]);
      const candidate = [
        ...(configs[0].providers ?? []).map((provider) => ({ provider, scope: "system" as const })),
        ...(configs[1].providers ?? []).map((provider) => ({ provider, scope: "custom" as const })),
      ].find((item) => item.provider.key === selection.channelId);
      if (candidate) {
        return Boolean(
          modelNames(candidate.provider).includes(selection.model),
        );
      }
    } catch (error) {
      console.error("Failed to validate OpenClaw Manager model selection", error);
    }
  }
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
  if (hasManagerUser()) {
    try {
      const configs = await Promise.all([
        getOpenClawModelConfig("system"),
        getOpenClawModelConfig("custom"),
      ]);
      const provider = selection
        ? configs.flatMap((config) => config.providers ?? []).find((item) => item.key === selection.channelId)
        : configs.flatMap((config) => config.providers ?? []).find((item) => item.api_key && modelNames(item).length > 0);
      if (provider?.api_key) {
        const model = selection?.model ?? modelNames(provider)[0];
        if (model && modelNames(provider).includes(model)) {
          return { apiKey: provider.api_key, baseUrl: provider.base_url, model };
        }
      }
      if (selection && provider) return null;
    } catch (error) {
      console.error("Failed to resolve OpenClaw Manager model provider", error);
    }
  }
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
