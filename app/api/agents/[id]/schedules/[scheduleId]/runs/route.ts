/**
 * GET /api/agents/[id]/schedules/[scheduleId]/runs — the run history.
 *
 * Cursor-paged newest-first on `(scheduled_for, id)`, which matches
 * `agent_schedule_runs_sched_idx` exactly, so the page is an index scan rather
 * than a sort.
 *
 * This route deliberately does NOT require the schedule to still exist: history
 * survives a DELETE (§3.0 delta 11) and stays addressable, so authorization
 * scopes on `agent_id` — which still has its FK and still cascades when the
 * AGENT is deleted — rather than on a row that may be gone.
 */
import { apiError, json, notFound, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { scheduleRunsQuerySchema } from "@/lib/schedules/validation";
import { listScheduleRuns } from "@/lib/services/schedules";
import { scheduleErrorResponse } from "@/lib/schedules/errors";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function langOf(req: Request) {
  const raw = new URL(req.url).searchParams.get("lang") ?? "en";
  return isLang(raw) ? raw : "en";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> },
) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, scheduleId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const url = new URL(req.url);
  const parsed = scheduleRunsQuerySchema.safeParse(
    Object.fromEntries(
      ["status", "limit", "cursor"]
        .map((k) => [k, url.searchParams.get(k)])
        .filter(([, v]) => v !== null),
    ),
  );
  if (!parsed.success) {
    return apiError("Validation failed", 422, { issues: parsed.error.flatten() });
  }

  try {
    return json(await listScheduleRuns(id, scheduleId, parsed.data));
  } catch (e) {
    // A malformed cursor is the only ScheduleError this route can raise, and it
    // is a 422 like every other unprocessable input.
    return scheduleErrorResponse(e, langOf(req));
  }
}
