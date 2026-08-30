/**
 * GET | PATCH | DELETE /api/agents/[id]/schedules/[scheduleId]
 *
 * The nested id is re-scoped in the SAME query — `WHERE id = $scheduleId AND
 * agent_id = $agentId` — never fetched by id alone. A schedule id from another
 * tenant must 404 even when the caller owns *an* agent, which is only true if
 * the agent check and the schedule check are one predicate.
 */
import { json, notFound, parseBody, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { updateScheduleSchema } from "@/lib/schedules/validation";
import { serializeSchedule } from "@/lib/schedules/serialize";
import { scheduleErrorResponse } from "@/lib/schedules/errors";
import { deleteSchedule, getScheduleRow, updateSchedule } from "@/lib/services/schedules";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; scheduleId: string }> };

function langOf(req: Request) {
  const raw = new URL(req.url).searchParams.get("lang") ?? "en";
  return isLang(raw) ? raw : "en";
}

export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, scheduleId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  const row = await getScheduleRow(id, scheduleId);
  if (!row) return notFound("Schedule not found");
  return json({ schedule: serializeSchedule(row, { lang: langOf(req) }) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, scheduleId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  const existing = await getScheduleRow(id, scheduleId);
  if (!existing) return notFound("Schedule not found");

  const parsed = await parseBody(req, updateScheduleSchema);
  if (parsed.res) return parsed.res;

  try {
    const row = await updateSchedule(
      { workspaceId: auth.ctx.workspace.id, agent, scheduleId },
      existing,
      parsed.data,
    );
    return json({ schedule: serializeSchedule(row, { lang: langOf(req) }) });
  } catch (e) {
    return scheduleErrorResponse(e, langOf(req));
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, scheduleId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  // History is NOT erased: agent_schedule_runs carries no FK to this table and
  // snapshots `schedule_name`, so GET …/runs keeps working after the delete.
  const ok = await deleteSchedule(id, scheduleId);
  if (!ok) return notFound("Schedule not found");
  return new Response(null, { status: 204 });
}
