import { json, notFound, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { getHealth } from "@/lib/activity/queries";
import { activityErrorResponse, toAgentFacts } from "@/lib/activity/route-helpers";
import { parseHealthQuery } from "@/lib/activity/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/:id/health
 *
 * Bucketed capacity samples plus the liveness summary. Range defaults to 24
 * hours; the response is ~300 buckets whatever the range, so there is no
 * pagination — the range picker is the control. Sending a day of raw
 * 60-second samples would be ~180 KB of JSON to draw ~120 pixels of ink.
 *
 * THE VIEW IS NEVER FULLY EMPTY. `liveness` is derived from `agents`
 * (`last_heartbeat_at`, `config_revision`, `applied_config_revision`,
 * `uptime_started_at`) and needs no health sample at all — which matters
 * because `agent.health` is the least-implemented event upstream, so
 * `sampleSource: "none"` is the launch default. `emptyReason` describes the
 * CHARTS; the liveness block renders regardless.
 *
 * Mock samples are counted per bucket and never averaged in silently: a
 * simulated reading folded into a real agent's history is indistinguishable
 * from success, which is the worst outcome available on this page.
 */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;

  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  try {
    const range = parseHealthQuery(new URL(req.url).searchParams);
    return json(await getHealth({ agent: toAgentFacts(agent), range }));
  } catch (e) {
    return activityErrorResponse(e);
  }
}
