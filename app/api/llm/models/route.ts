import { requireAuth, parseBody, jsonPrivate, apiError, notFound } from "@/lib/api";
import { fetchLlmModelsSchema } from "@/lib/llm/channel-validation";
import { fetchProviderModels, fetchSystemModels, syncStoredChannelModels, LlmChannelError } from "@/lib/llm/channel-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, fetchLlmModelsSchema);
  if (parsed.res) return parsed.res;
  try {
    const models = parsed.data.source === "draft"
      ? await fetchProviderModels(parsed.data)
      : parsed.data.channelKind === "system"
        ? await fetchSystemModels(parsed.data.channelId)
        : await syncStoredChannelModels(auth.ctx.workspace.id, parsed.data.channelId);
    return models ? jsonPrivate({ models }) : notFound("LLM channel not found or unavailable");
  } catch (error) {
    if (error instanceof LlmChannelError) return apiError(error.message, error.status);
    console.error("[llm-models] request failed", error);
    return apiError("Could not load models from the provider.", 502);
  }
}
