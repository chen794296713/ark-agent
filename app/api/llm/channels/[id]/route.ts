import { requireAuth, parseBody, jsonPrivate, apiError, notFound } from "@/lib/api";
import { updateLlmChannelSchema } from "@/lib/llm/channel-validation";
import { deleteLlmChannel, updateLlmChannel, LlmChannelError } from "@/lib/llm/channel-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof LlmChannelError) return apiError(error.message, error.status);
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "23505") return apiError("A channel with this name already exists.", 409);
  console.error("[llm-channel] request failed", error);
  return apiError("Could not update the LLM channel.", 500);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, updateLlmChannelSchema);
  if (parsed.res) return parsed.res;
  const { id } = await params;
  try {
    const channel = await updateLlmChannel(auth.ctx.workspace.id, id, parsed.data);
    return channel ? jsonPrivate({ channel }) : notFound("LLM channel not found");
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  return await deleteLlmChannel(auth.ctx.workspace.id, id)
    ? jsonPrivate({ ok: true as const })
    : notFound("LLM channel not found");
}
