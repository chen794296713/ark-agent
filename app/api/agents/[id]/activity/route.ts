import { json, notFound, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { getTimeline } from "@/lib/activity/queries";
import { activityErrorResponse, toAgentFacts } from "@/lib/activity/route-helpers";
import { parseTimelineQuery } from "@/lib/activity/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/:id/activity
 *
 * The merged timeline: `agent_runs` and `agent_activities`, newest first, one
 * keyset page at a time.
 *
 * Filters: `from` `to` `cursor` `limit` `q` `severity` `trigger` `outcome`
 * `type` `tag` `channel` `session` `run` `model`. They COMPOSE, and a filter
 * belonging to one branch suppresses the other rather than leaving it
 * unfiltered. An unrecognised filter VALUE is dropped and reported in
 * `ignoredFilters`; a malformed structural parameter (date, limit, cursor,
 * range width) is a 4xx with a machine `code`.
 *
 * THIS ROUTE IS NOT AN "AGENT OPERATION", and the exception is deliberate.
 * The contract has every agent operation return 503 while the runtime is
 * unconfigured — but everything read here lives in ArkAgent's own Postgres. A
 * terminated agent's history, ArkAgent's own bookkeeping lines, last month's
 * credits: all of it is correct whether or not a runtime is reachable right
 * now. Returning 503 would hide records ArkAgent owns because a different
 * system is down. Unconfigured means we cannot act, not that we cannot
 * remember — so this answers 200 with `managerMode` and, when empty, an
 * `emptyReason` that names the cause.
 */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;

  // Scoped by workspace, and a cross-workspace id is a 404 rather than a 403:
  // a 403 confirms the agent exists, which is the disclosure it was meant to
  // prevent (docs/API.md).
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  try {
    const filters = parseTimelineQuery(new URL(req.url).searchParams);
    return json(await getTimeline({ agent: toAgentFacts(agent), filters }));
  } catch (e) {
    return activityErrorResponse(e);
  }
}
