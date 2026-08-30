import { json, notFound, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { getRun } from "@/lib/activity/queries";
import { activityErrorResponse, toAgentFacts } from "@/lib/activity/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; runId: string }> };

/**
 * GET /api/agents/:id/runs/:runId
 *
 * One run and its step trace. `runId` accepts either ArkAgent's uuid or the
 * runtime's own `external_run_id`, because both appear in links.
 *
 * The trace is ordered by `idx` and never by `occurred_at`: `idx` is the
 * runtime's render order, steps arrive out of order under batching, and
 * ordering by the clock re-introduces exactly the bug the `occurredAt` rename
 * was made to prevent. It is capped at 200 steps with `stepsTruncated` — a run
 * with 2,000 steps is a pathology to surface, not to paginate.
 *
 * Both guards are here: the agent is resolved against the caller's workspace,
 * and the run is then matched against THAT agent's id — so a run id from
 * another workspace 404s twice over rather than leaking a trace.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, runId } = await params;

  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  try {
    const run = await getRun(toAgentFacts(agent).id, runId);
    if (!run) return notFound("Run not found");
    return json(run);
  } catch (e) {
    return activityErrorResponse(e);
  }
}
