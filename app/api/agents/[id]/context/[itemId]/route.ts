/**
 * GET    /api/agents/[id]/context/[itemId] — one item, with the full pasted body.
 * PATCH  /api/agents/[id]/context/[itemId] — rename, re-scope, or edit the payload.
 * DELETE /api/agents/[id]/context/[itemId] — remove it.
 *
 * AUTHORIZATION: `requireAuth()` -> `getAgentRow(id, ctx.workspace.id)` ->
 * `notFound()`, and every statement underneath is additionally keyed on that
 * agent id. A well-formed `itemId` belonging to another workspace matches zero
 * rows and gets the same 404 as an id that never existed.
 *
 * GET is the only route that returns the whole `text_body`; the list carries a
 * bounded preview. That is a payload decision, not a permission one — a fleet
 * page that shipped fifty 8,000-character bodies to render fifty one-line rows
 * is a page nobody waits for.
 *
 * PATCH cannot change `kind` or `state`. Kind decides which column holds the
 * payload and which state machine the row is in, so "turn this file into a URL"
 * is a delete and a create. State belongs to the runtime, which reports
 * `indexing`, `indexed` and `failed`; a browser that could write `indexed` could
 * tell the agent an empty row was ready. Editing the payload does move the row
 * back to `pending` — the existing chunks describe the OLD text, and leaving it
 * `indexed` would assert an index that no longer matches its source.
 *
 * A new `url` goes through `isSafePublicHttpsUrl()` again on the way in. This
 * route still never fetches it; the agent's egress sandbox does.
 */
import { json, notFound, parseBody, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { isUuid, updateContextItemSchema } from "@/lib/agent-config/validation";
import {
  agentConfigErrorResponse,
  deleteContextItem,
  getContextItem,
  updateContextItem,
} from "@/lib/services/agent-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, itemId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  // `agent_context_items.id` is a `uuid`. A non-uuid segment would otherwise
  // reach Postgres as `22P02` and surface as a 500 — a shape error dressed as a
  // server fault.
  if (!isUuid(itemId)) return notFound("Context item not found");

  const item = await getContextItem(agent.id, itemId);
  if (!item) return notFound("Context item not found");
  return json({ item });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, itemId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  if (!isUuid(itemId)) return notFound("Context item not found");

  const parsed = await parseBody(req, updateContextItemSchema);
  if (parsed.res) return parsed.res;

  try {
    const item = await updateContextItem(agent.id, itemId, parsed.data);
    if (!item) return notFound("Context item not found");
    return json({ item });
  } catch (e) {
    return agentConfigErrorResponse(e);
  }
}

/**
 * Delete.
 *
 * `outcome` says which of the two things happened, because they are different
 * facts about the agent. `deleted` — nothing was ever indexed, the row is gone.
 * `removing` — the runtime has indexed this item, so the row is marked `removed`
 * (the terminal state it watches for) and the chunks come out of the agent's
 * index on its next poll. Hard-deleting that one would leave retrievable text in
 * an agent's index with no record anywhere that it is still there.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, itemId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  if (!isUuid(itemId)) return notFound("Context item not found");

  try {
    const outcome = await deleteContextItem(agent.id, itemId);
    if (!outcome) return notFound("Context item not found");
    return json({ outcome });
  } catch (e) {
    return agentConfigErrorResponse(e);
  }
}
