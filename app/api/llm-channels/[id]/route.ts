import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmChannels } from "@/lib/db/schema";
import { apiError, jsonPrivate, notFound, parseBody, requireAuth } from "@/lib/api";
import { llmChannelSchema } from "@/lib/validation";
import {
  assertPublicHttpsUrl,
  getCustomLlmChannel,
  normalizeBaseUrl,
  serializeLlmChannel,
} from "@/lib/services/llm-channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await ctx.params;
  const current = await getCustomLlmChannel(auth.ctx.workspace.id, id);
  if (!current) return notFound("LLM channel not found");
  const parsed = await parseBody(req, llmChannelSchema);
  if (parsed.res) return parsed.res;
  try {
    assertPublicHttpsUrl(parsed.data.baseUrl);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Invalid model endpoint", 422);
  }
  const apiKey = parsed.data.apiKey === "••••••••" ? current.apiKeyEncrypted : parsed.data.apiKey.trim();
  if (!apiKey) return apiError("API key is required", 422);
  try {
    const [channel] = await db
      .update(llmChannels)
      .set({
        name: parsed.data.name,
        baseUrl: normalizeBaseUrl(parsed.data.baseUrl),
        apiKeyEncrypted: apiKey,
        models: Array.from(new Set(parsed.data.models)),
        updatedAt: new Date(),
      })
      .where(and(eq(llmChannels.id, id), eq(llmChannels.workspaceId, auth.ctx.workspace.id)))
      .returning();
    return jsonPrivate({ channel: serializeLlmChannel(channel) });
  } catch (error) {
    if (String(error).includes("llm_channels_workspace_name_uniq")) {
      return apiError("A channel with this name already exists", 409);
    }
    throw error;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await ctx.params;
  const [deleted] = await db
    .delete(llmChannels)
    .where(and(eq(llmChannels.id, id), eq(llmChannels.workspaceId, auth.ctx.workspace.id)))
    .returning({ id: llmChannels.id });
  if (!deleted) return notFound("LLM channel not found");
  return jsonPrivate({ ok: true });
}
