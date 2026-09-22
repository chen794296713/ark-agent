import { requireAuth, parseBody, jsonPrivate, apiError } from "@/lib/api";
import { llmCallConfigSchema } from "@/lib/llm/channel-validation";
import { getLlmCallConfig, saveLlmCallConfig, LlmChannelError } from "@/lib/llm/channel-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  try {
    return jsonPrivate({ config: await getLlmCallConfig(auth.ctx.workspace.id) });
  } catch (error) {
    if (error instanceof LlmChannelError) return apiError(error.message, error.status);
    console.error("[llm-config] request failed", error);
    return apiError("Could not load the LLM call configuration.", 500);
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, llmCallConfigSchema);
  if (parsed.res) return parsed.res;
  try {
    return jsonPrivate({ config: await saveLlmCallConfig(auth.ctx.workspace.id, parsed.data) });
  } catch (error) {
    if (error instanceof LlmChannelError) return apiError(error.message, error.status);
    console.error("[llm-config] request failed", error);
    return apiError("Could not save the LLM call configuration.", 500);
  }
}
