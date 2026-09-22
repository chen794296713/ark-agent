import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmChannels } from "@/lib/db/schema";
import { apiError, jsonPrivate, parseBody, requireAuth } from "@/lib/api";
import { llmChannelSchema } from "@/lib/validation";
import {
  assertPublicHttpsUrl,
  listLlmChannels,
  normalizeBaseUrl,
  serializeLlmChannel,
} from "@/lib/services/llm-channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  return jsonPrivate({ channels: await listLlmChannels(auth.ctx.workspace.id) });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, llmChannelSchema);
  if (parsed.res) return parsed.res;
  try {
    assertPublicHttpsUrl(parsed.data.baseUrl);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Invalid model endpoint", 422);
  }
  if (!parsed.data.apiKey.trim()) return apiError("API key is required", 422);
  const existing = await db
    .select({ id: llmChannels.id })
    .from(llmChannels)
    .where(eq(llmChannels.workspaceId, auth.ctx.workspace.id))
    .orderBy(asc(llmChannels.createdAt));
  if (existing.length >= 20) return apiError("A workspace can have at most 20 custom LLM channels", 422);
  try {
    const [channel] = await db
      .insert(llmChannels)
      .values({
        workspaceId: auth.ctx.workspace.id,
        name: parsed.data.name,
        provider: "custom",
        protocol: "openai-compatible",
        baseUrl: normalizeBaseUrl(parsed.data.baseUrl),
        apiKeyEncrypted: parsed.data.apiKey.trim(),
        enabled: true,
        models: Array.from(new Set(parsed.data.models)),
      })
      .returning();
    return jsonPrivate({ channel: serializeLlmChannel(channel) }, 201);
  } catch (error) {
    if (String(error).includes("llm_channels_workspace_name_uniq")) {
      return apiError("A channel with this name already exists", 409);
    }
    throw error;
  }
}
