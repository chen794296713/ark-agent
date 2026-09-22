import { json, notFound, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { getRuns } from "@/lib/activity/queries";
import { activityErrorResponse, toAgentFacts } from "@/lib/activity/route-helpers";
import { parseRunQuery } from "@/lib/activity/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/:id/runs
 *
 * The run list: one row per unit of work, newest first, keyset-paged.
 *
 * Filters: `from` `to` `cursor` `limit` `q` `trigger` `outcome` `session`
 * `model`. Deliberately NO `severity` — a run already has a status, and
 * offering both invites `severity=info` + `outcome=failed`, which returns
 * nothing for reasons the user cannot see.
 *
 * Synthetic day-runs (`external_run_id LIKE 'system:%'`) are excluded: they are
 * carriers for out-of-run tool calls, never finish, and would put a permanently
 * "running" row at the top of every page.
 *
 * Nothing writes `agent_runs` yet, so an empty list with
 * `emptyReason: "no_data_yet"` is the expected answer at launch — which is why
 * the reason is computed here rather than guessed at in the page.
 */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;

  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  try {
    const filters = parseRunQuery(new URL(req.url).searchParams);
    return json(await getRuns({ agent: toAgentFacts(agent), filters }));
  } catch (e) {
    return activityErrorResponse(e);
  }
}
