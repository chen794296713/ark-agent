import { requireAuth, parseBody, jsonPrivate, apiError } from "@/lib/api";
import { createLlmChannelSchema } from "@/lib/llm/channel-validation";
import { createLlmChannel, listLlmChannels, LlmChannelError } from "@/lib/llm/channel-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof LlmChannelError) return apiError(error.message, error.status);
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "23505") return apiError("A channel with this name already exists.", 409);
  console.error("[llm-channels] request failed", error);
  return apiError("Could not save the LLM channel.", 500);
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  try {
    return jsonPrivate(await listLlmChannels(auth.ctx.workspace.id));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, createLlmChannelSchema);
  if (parsed.res) return parsed.res;
  try {
    return jsonPrivate({ channel: await createLlmChannel(auth.ctx.workspace.id, parsed.data) }, 201);
  } catch (error) {
    return failure(error);
  }
}
