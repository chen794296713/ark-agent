/**
 * GET  /api/agents/[id]/context — the agent's context items.
 * POST /api/agents/[id]/context — add pasted text, a URL, or register a file
 *                                 that is waiting to be uploaded.
 *
 * AUTHORIZATION: `requireAuth()` -> `getAgentRow(id, ctx.workspace.id)` ->
 * `notFound()`, before anything touches `agent_context_items`. Cross-workspace is
 * a 404, never a 403.
 *
 * THE URL CASE IS THE ONE THAT MATTERS.
 * A `url` item is a persisted instruction to fetch, and the fetch happens on the
 * agent's own VM, inside the runtime's egress sandbox. **This route never
 * fetches it, not even to check that it resolves** — a control plane that
 * followed a user-supplied link would be the SSRF primitive the sandbox exists
 * to contain, and "just a HEAD request to validate it" is exactly how that
 * arrives. What we owe instead is a guard on what may be STORED, and that is
 * `isSafePublicHttpsUrl()` from `lib/atg/safety.ts`: https only, no userinfo, no
 * custom port, and no loopback, private, link-local, CGNAT, `.local`,
 * `.internal` or bare-label host. `169.254.169.254` is refused here so it is
 * never handed to a runtime with our signature on it.
 *
 * A `file` item is registered, not uploaded. The row is created
 * `awaiting_upload` with `bytes = 0` and no `content_url`, because no bytes
 * exist; the runtime is required to skip such a row silently rather than fetch a
 * null URL. Its mime must be in `CONTEXT_MIME_ALLOWLIST` — the manage screen
 * draws an "upload this" affordance from the row, and an
 * `application/x-msdownload` there is a lure wearing our chrome.
 *
 * Text bodies are capped twice, in characters and in UTF-8 bytes
 * (`CONTEXT_LIMITS`), because `text_body` is an unbounded `text` column that is
 * read back into a prompt. The stored text is DATA: it goes to the model as
 * material, never as an instruction to the runtime service.
 *
 * NO 503. Every path here is a Postgres write and works with no LLM key and no
 * Agent Manager.
 */
import { json, notFound, parseBody, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { createContextItemSchema } from "@/lib/agent-config/validation";
import {
  agentConfigErrorResponse,
  createContextItem,
  listContextItems,
} from "@/lib/services/agent-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  return json(await listContextItems(agent.id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const parsed = await parseBody(req, createContextItemSchema);
  if (parsed.res) return parsed.res;

  try {
    return json({ item: await createContextItem(agent.id, parsed.data) }, 201);
  } catch (e) {
    return agentConfigErrorResponse(e);
  }
}
