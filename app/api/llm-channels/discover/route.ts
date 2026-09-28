import { apiError, jsonPrivate, parseBody, requireAuth } from "@/lib/api";
import { discoverLlmModelsSchema } from "@/lib/validation";
import { discoverModels, getCustomLlmChannel } from "@/lib/services/llm-channels";
import { getOpenClawModelConfig } from "@/app/lib/openclaw_manager_api";
import { withOpenClawManagerUser } from "@/lib/openclaw-manager-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, discoverLlmModelsSchema);
  if (parsed.res) return parsed.res;
  let key = parsed.data.apiKey?.trim() ?? "";
  if (!key && parsed.data.channelId) {
    if (auth.ctx.user) {
      const provider = await withOpenClawManagerUser(auth.ctx.user, async () => {
        const config = await getOpenClawModelConfig("custom");
        return (config.providers ?? []).find((item) => item.key === parsed.data.channelId);
      });
      if (!provider) return apiError("LLM channel not found", 404);
      key = provider.api_key?.trim() ?? "";
    } else {
      const channel = await getCustomLlmChannel(auth.ctx.workspace.id, parsed.data.channelId);
      if (!channel) return apiError("LLM channel not found", 404);
      key = channel.apiKeyEncrypted;
    }
  }
  if (!key || key === "••••••••") return apiError("API key is required to fetch models", 422);
  try {
    return jsonPrivate({ models: await discoverModels(parsed.data.baseUrl, key) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch models";
    return apiError(message === "This operation was aborted" ? "Model request timed out" : message, 502);
  }
}
