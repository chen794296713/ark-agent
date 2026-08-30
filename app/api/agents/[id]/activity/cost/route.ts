import { json, notFound, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { getCost } from "@/lib/activity/queries";
import { activityErrorResponse, toAgentFacts } from "@/lib/activity/route-helpers";
import { parseCostQuery } from "@/lib/activity/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/:id/activity/cost
 *
 * Token and credit analytics for one agent. Range only (default 30 days); every
 * list is a `LIMIT 10`, so there is no pagination.
 *
 * THREE LEDGERS, NEVER MERGED, because merging them would fabricate a number:
 *
 *  - `totals` / `daily` / `byTrigger` / `byModel` / `topRuns` — `agent_runs`,
 *    what the RUNTIME reported. Empty until the backend ships.
 *  - `llm` — `llm_usage`, ArkAgent's OWN model spend on this agent's behalf
 *    (chat, brief, self-review, template generation). This is the ledger that
 *    is non-empty today, and its `estimatedCalls` is what proves a zero is a
 *    missing price rather than a free call.
 *  - `credits` — `usage_records`, the billing ledger. Credits are NOT converted
 *    to dollars here: ArkAgent owns pricing, and an invented exchange rate in a
 *    cost view is exactly the kind of plausible fake number that outlives the
 *    sprint that added it.
 *
 * All money is micro-USD and is summed in micro-USD, converted once at render.
 * Summing per-run values already rounded to cents makes a 412-run month wrong
 * by more than the total.
 */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;

  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  try {
    const range = parseCostQuery(new URL(req.url).searchParams);
    return json(
      await getCost({
        agent: toAgentFacts(agent),
        // `usage_records` is workspace-scoped, not agent-scoped — the one table
        // on this page that is, and therefore the one whose scope gets
        // forgotten. It is passed explicitly rather than re-derived.
        workspaceId: auth.ctx.workspace.id,
        range,
      }),
    );
  } catch (e) {
    return activityErrorResponse(e);
  }
}
